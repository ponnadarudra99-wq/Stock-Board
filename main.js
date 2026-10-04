/* ===== Stock Board - shared logic (data, login, sidebar) ===== */
const SB = (() => {
  const KEY_C = 'sb_components', KEY_O = 'sb_orders', KEY_S = 'sb_session';
  const componentsRef = db.collection("components");
const ordersRef = db.collection("orders");

  // Employee accounts. NOTE: front-end only demo. For real security, move login to a backend.
  const EMPLOYEES = [ 
  { user: 'Epick', pass: 'Epick bike' }
];

  const SEED = [
    { id: 1, name: 'hdjd',    dept: 'electronics', stock: 78, minQty: 56, perDevice: 1, cost: 970, delivery: 9 },
    { id: 2, name: 'battery', dept: 'electronics', stock: 20, minQty: 4,  perDevice: 1, cost: 230, delivery: 7 }
  ];

 const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};

const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const getComponents = async () => {
  const snapshot = await componentsRef.get();

  if (snapshot.empty) {
    for (const c of SEED) {
      await componentsRef.doc(String(c.id)).set(c);
    }
    return SEED;
  }

  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: Number(doc.id)
  }));
};

const saveComponents = async (components) => {
  const snapshot = await componentsRef.get();
  const batch = db.batch();

  // Existing Firebase documents delete
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Current components save
  components.forEach(c => {
    const ref = componentsRef.doc(String(c.id));
    batch.set(ref, c);
  });

  await batch.commit();
};
const getOrders = async () => {
  const snapshot = await ordersRef.get();

  return snapshot.docs.map(doc => ({
    ...doc.data(),
    id: Number(doc.id)
  }));
};

const saveOrders = async (orders) => {
  const batch = db.batch();

  orders.forEach(o => {
    const ref = ordersRef.doc(String(o.id));
    batch.set(ref, o);
  });

  await batch.commit();
};

  const session = () => load(KEY_S, null);
  const isEmployee = () => !!session();

  const status = c => c.stock < c.minQty ? 'critical' : (c.stock < c.minQty * 1.25 ? 'low' : 'stocked');
  const statusLabel = { critical: 'CRITICAL', low: 'LOW', stocked: 'STOCKED' };

  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const money = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let toastTimer;
  const toast = msg => {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  const listeners = [];
  const onAuthChange = fn => listeners.push(fn);

  const NAV = [
    { key: 'dashboard',  href: 'index.html',      icon: 'fa-table-cells-large', label: 'Dashboard' },
    { key: 'production', href: 'production.html', icon: 'fa-industry',          label: 'Production Details' },
    { key: 'components', href: 'components.html', icon: 'fa-cube',              label: 'Components' },
    { key: 'orders',     href: 'orders.html',     icon: 'fa-truck',             label: 'Orders' }
  ];

  function renderSidebar(active) {
    const s = session();
    document.getElementById('sidebar').innerHTML = `
      <div class="brand"><i class="fa-solid fa-box-open"></i>
        <div><h1>Stock Board</h1><p>One device, every part</p></div></div>
      <nav class="nav">${NAV.map(n => `
        <a href="${n.href}" class="${n.key === active ? 'active' : ''}">
          <i class="fa-solid ${n.icon}"></i><span>${n.label}</span>
          ${n.key === 'orders' ? `<span class="badge" id="orderBadge">${getOrders().length}</span>` : ''}
        </a>`).join('')}</nav>
      <div class="sidebar-foot">
        ${s ? `<div class="who">Signed in as <b>${esc(s.user)}</b></div>` : ''}
        <button class="login-btn" id="authBtn">
          <i class="fa-solid ${s ? 'fa-right-from-bracket' : 'fa-user-lock'}"></i>${s ? 'Log Out' : 'Log In'}
        </button>
      </div>`;
    document.getElementById('authBtn').onclick = () => s ? logout() : openLogin();
  }

  function injectShell(active) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="overlay" id="loginOverlay">
        <form class="modal" id="loginForm" autocomplete="off">
          <h3>Employee Login</h3>
          <p class="hint">Only employees can add or change components.</p>
          <div class="field"><label>Username</label><input id="lUser" required></div>
          <div class="field"><label>Password</label><input id="lPass" type="password" required></div>
          <div class="error" id="lError"></div>
          <div class="actions">
            <button type="button" class="btn" id="lCancel">Cancel</button>
            <button class="btn primary">Log In</button>
          </div>
        </form>
      </div>
      <div id="toast"></div>`);
    document.getElementById('lCancel').onclick = closeLogin;
    document.getElementById('loginOverlay').onclick = e => { if (e.target.id === 'loginOverlay') closeLogin(); };
    document.getElementById('loginForm').onsubmit = e => {
      e.preventDefault();
      const u = lUser.value.trim(), p = lPass.value;
      const ok = EMPLOYEES.find(x => x.user === u && x.pass === p);
      if (!ok) { lError.textContent = 'Wrong username or password.'; return; }
      save(KEY_S, { user: ok.user }); closeLogin(); refresh(active); toast('Welcome, ' + ok.user);
    };
    // mobile top bar
    const main = document.querySelector('.main');
    main.insertAdjacentHTML('beforebegin',
      `<div class="topbar"><button id="menuBtn" aria-label="Menu"><i class="fa-solid fa-bars"></i></button><b>Stock Board</b></div>`);
    document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  }

  const openLogin = () => { lError.textContent = ''; loginForm.reset(); loginOverlay.classList.add('open'); lUser.focus(); };
  const closeLogin = () => loginOverlay.classList.remove('open');
  let currentPage = '';
  function logout() { localStorage.removeItem(KEY_S); refresh(currentPage); toast('Logged out'); }
  function refresh(active) { renderSidebar(active); listeners.forEach(fn => fn()); }

  function init(active) {
    currentPage = active;
    injectShell(active);
    refresh(active);
  }

  return { init, getComponents, saveComponents, getOrders, saveOrders, isEmployee, status, statusLabel,
           addDays, fmtDate, money, esc, toast, onAuthChange, refresh: () => refresh(currentPage) };
})();

/* ===== Page scripts ===== */
const PAGES = {};
PAGES.dashboard = function () {
/* ===== Dashboard page ===== */
function renderDashboard() {
  const comps = SB.getComponents();
  const critical = comps.filter(c => SB.status(c) === 'critical');
  const low = comps.filter(c => SB.status(c) === 'low');
  const ok = comps.filter(c => SB.status(c) === 'stocked');
  const today = new Date();
  const longest = critical.reduce((m, c) => Math.max(m, c.delivery), 0);

  const big = document.getElementById('bigCount');
  big.textContent = critical.length;
  big.classList.toggle('alert', critical.length > 0);
  document.getElementById('longest').textContent = critical.length ? SB.fmtDate(SB.addDays(today, longest)) : 'N/A';
  document.getElementById('fill').style.width = critical.length ? Math.min(longest / 45 * 100, 100) + '%' : '0';

  document.getElementById('t0').textContent = SB.fmtDate(today);
  [15, 30, 45].forEach(n => document.getElementById('t' + n).textContent = '+' + n + ' days');

  document.getElementById('sTotal').textContent = comps.length;
  document.getElementById('sCrit').textContent = critical.length;
  document.getElementById('sLow').textContent = low.length;
  document.getElementById('sOk').textContent = ok.length;

  const list = [...critical, ...low];
  document.getElementById('alerts').innerHTML = list.length
    ? list.map(c => { const s = SB.status(c); return `
        <div class="alert-row">
          <div><strong>${SB.esc(c.name)}</strong><br><small>${SB.esc(c.dept)} · Stock ${c.stock} / Min ${c.minQty} · Delivery ${c.delivery}d</small></div>
          <span class="tag ${s}">${SB.statusLabel[s]}</span>
        </div>`; }).join('')
    : '<div class="empty">No immediate stock warnings right now.</div>';
}
SB.init('dashboard');
SB.onAuthChange(renderDashboard);
renderDashboard();
};
PAGES.production = function () {
/* ===== Production Details page ===== */
const input = document.getElementById('orderCount');

function renderProduction() {
  const emp = SB.isEmployee();
  const n = parseInt(input.value, 10);
  const body = document.getElementById('prodBody');
  const cols = emp ? 8 : 7;
  document.getElementById('actionTh').classList.toggle('hidden', !emp);

  if (!n || n < 1) {
    body.innerHTML = `<tr><td colspan="${cols}" class="empty">Enter the number of orders above to calculate requirements.</td></tr>`;
    return;
  }
  const comps = SB.getComponents();
  let total = 0, maxDays = 0;
  const rows = comps.map(c => {
    const required = n * c.perDevice;
    const shortage = Math.max(0, required - c.stock);
    const orderQty = shortage > 0 ? Math.max(shortage, c.minQty) : 0;
    const cost = orderQty * c.cost;
    total += cost; if (orderQty) maxDays = Math.max(maxDays, c.delivery);
    return `<tr>
      <td><b>${SB.esc(c.name)}</b></td>
      <td>${c.stock}</td>
      <td class="${shortage ? 'short' : 'ok'}">${required}</td>
      <td>${c.minQty}</td>
      <td>${SB.money(c.cost)}</td>
      <td>${orderQty ? SB.money(cost) : '—'}</td>
      <td>${orderQty ? SB.fmtDate(SB.addDays(new Date(), c.delivery)) : 'In stock'}</td>
      ${emp ? `<td>${orderQty ? `<button class="btn sm primary" data-order="${c.id}" data-qty="${orderQty}">Order ${orderQty}</button>` : ''}</td>` : ''}
    </tr>`;
  }).join('');
  body.innerHTML = rows + `<tr class="total-row"><td colspan="5">Total to order</td><td>${SB.money(total)}</td>
    <td>${total ? SB.fmtDate(SB.addDays(new Date(), maxDays)) : '—'}</td>${emp ? '<td></td>' : ''}</tr>`;

  body.querySelectorAll('[data-order]').forEach(b => b.onclick = () => {
    const c = SB.getComponents().find(x => x.id === +b.dataset.order);
    const orders = SB.getOrders();
    orders.push({ id: Date.now(), componentId: c.id, name: c.name, qty: +b.dataset.qty,
                  orderDate: new Date().toISOString(), expected: SB.addDays(new Date(), c.delivery).toISOString() });
    SB.saveOrders(orders); SB.refresh(); SB.toast('Order placed for ' + c.name);
  });
}
input.oninput = renderProduction;
SB.init('production');
SB.onAuthChange(renderProduction);
renderProduction();
};
PAGES.components = function () {
  /* ===== Components page ===== */

  let editingId = null;

  async function renderComponents() {
    const emp = SB.isEmployee();

    document.getElementById('addBtnWrap').classList.toggle('hidden', !emp);

    const q = document.getElementById('search').value.trim().toLowerCase();

    try {
      const allComponents = await SB.getComponents();

      const comps = allComponents.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.dept.toLowerCase().includes(q)
      );

      const groups = {};

      comps.forEach(c => {
        if (!groups[c.dept]) {
          groups[c.dept] = [];
        }
        groups[c.dept].push(c);
      });

      const depts = Object.keys(groups).sort();

      document.getElementById('list').innerHTML = depts.length
        ? depts.map(d => `
          <section class="group">
            <h3 class="dept">${SB.esc(d)}</h3>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Component Name</th>
                    <th>Status</th>
                    <th class="num">Stock</th>
                    <th class="num">Min Qty</th>
                    <th class="num">Cost (₹)</th>
                    <th class="num">Delivery</th>
                    ${emp ? '<th></th>' : ''}
                  </tr>
                </thead>

                <tbody>
                  ${groups[d].map(c => {
                    const s = SB.status(c);

                    return `
                      <tr>
                        <td class="name">
                          ${SB.esc(c.name)}
                        </td>

                        <td>
                          <span class="tag ${s}">
                            ${SB.statusLabel[s]}
                          </span>
                        </td>

                        <td class="num">
                          <b>${c.stock}</b>
                        </td>

                        <td class="num">
                          ${c.minQty}
                        </td>

                        <td class="num">
                          ${SB.money(c.cost)}
                        </td>

                        <td class="num">
                          ${c.delivery}d
                        </td>

                        ${emp ? `
                          <td>
                            <div class="row-actions">

                              <button
                                class="btn sm"
                                data-edit="${c.id}">
                                <i class="fa-solid fa-pen"></i>
                                Edit
                              </button>

                              <button
                                class="btn sm danger"
                                data-del="${c.id}">
                                <i class="fa-solid fa-trash"></i>
                              </button>

                            </div>
                          </td>
                        ` : ''}
                      </tr>
                    `;
                  }).join('')}
                </tbody>

              </table>
            </div>
          </section>
        `).join('')
        : '<div class="card empty">No components found.</div>';

      document.querySelectorAll('[data-edit]').forEach(button => {
        button.onclick = () => {
          openForm(+button.dataset.edit);
        };
      });

      document.querySelectorAll('[data-del]').forEach(button => {
        button.onclick = () => {
          removeComp(+button.dataset.del);
        };
      });

    } catch (error) {
      console.error("Error loading components:", error);

      document.getElementById('list').innerHTML =
        '<div class="card empty">Unable to load components from Firebase.</div>';
    }
  }


  async function openForm(id) {
    if (!SB.isEmployee()) return;

    editingId = id || null;

    let c;

    if (id) {
      const allComponents = await SB.getComponents();
      c = allComponents.find(x => x.id === id);

      if (!c) {
        SB.toast('Component not found');
        return;
      }

    } else {

      c = {
        name: '',
        dept: '',
        stock: 0,
        minQty: 1,
        perDevice: 1,
        cost: 0,
        delivery: 1
      };
    }

    document.getElementById('formTitle').textContent =
      id ? 'Edit component' : 'Add component';

    const f = document.getElementById('compForm');

    [
      'name',
      'dept',
      'stock',
      'minQty',
      'perDevice',
      'cost',
      'delivery'
    ].forEach(k => {
      f.elements[k].value = c[k];
    });

    document.getElementById('formOverlay').classList.add('open');
  }


  const closeForm = () => {
    document.getElementById('formOverlay').classList.remove('open');
  };


  async function removeComp(id) {

    if (!SB.isEmployee()) return;

    if (!confirm('Delete this component?')) return;

    try {

      const components = await SB.getComponents();

      const updatedComponents =
        components.filter(c => c.id !== id);

      await SB.saveComponents(updatedComponents);

      const orders = await SB.getOrders();

      const updatedOrders =
        orders.filter(o => o.componentId !== id);

      await SB.saveOrders(updatedOrders);

      await renderComponents();

      SB.toast('Component deleted');

    } catch (error) {

      console.error("Delete error:", error);

      SB.toast('Unable to delete component');

    }
  }


  document.getElementById('compForm').onsubmit = async e => {

    e.preventDefault();

    if (!SB.isEmployee()) return;

    const f = e.target.elements;

    const data = {
      name: f.name.value.trim(),
      dept: f.dept.value.trim(),
      stock: +f.stock.value,
      minQty: +f.minQty.value,
      perDevice: +f.perDevice.value,
      cost: +f.cost.value,
      delivery: +f.delivery.value
    };

    try {

      const all = await SB.getComponents();

      if (editingId) {

        const index =
          all.findIndex(c => c.id === editingId);

        if (index !== -1) {

          all[index] = {
            ...all[index],
            ...data
          };

        }

        await SB.saveComponents(all);

        closeForm();

        await renderComponents();

        SB.toast('Component updated');

      } else {

        const newComponent = {
          id: Date.now(),
          ...data
        };

        all.push(newComponent);

        await SB.saveComponents(all);

        closeForm();

        await renderComponents();

        SB.toast('Component added');
      }

    } catch (error) {

      console.error("Save component error:", error);

      SB.toast('Unable to save component');

    }
  };


  document.getElementById('addBtn').onclick = () => {
    openForm();
  };


  document.getElementById('cancelForm').onclick = closeForm;


  document.getElementById('formOverlay').onclick = e => {

    if (e.target.id === 'formOverlay') {
      closeForm();
    }

  };


  document.getElementById('search').oninput = renderComponents;


  SB.init('components');

  SB.onAuthChange(renderComponents);

  renderComponents();

};
PAGES.orders = function () {
/* ===== Orders page ===== */
function renderOrders() {
  const emp = SB.isEmployee();
  const orders = SB.getOrders();
  document.getElementById('actionTh').classList.toggle('hidden', !emp);
  const body = document.getElementById('orderBody');
  body.innerHTML = orders.length ? orders.map(o => `
    <tr><td><b>${SB.esc(o.name)}</b></td><td>${o.qty}</td>
      <td>${SB.fmtDate(o.orderDate)}</td><td>${SB.fmtDate(o.expected)}</td>
      ${emp ? `<td><button class="btn sm primary" data-recv="${o.id}"><i class="fa-solid fa-check"></i> Mark received</button></td>` : ''}
    </tr>`).join('')
    : `<tr><td colspan="${emp ? 5 : 4}" class="empty empty-orders"><i class="fa-solid fa-box-open"></i>No active purchase orders.</td></tr>`;

  body.querySelectorAll('[data-recv]').forEach(b => b.onclick = () => {
    if (!SB.isEmployee()) return;
    const all = SB.getOrders(); const o = all.find(x => x.id === +b.dataset.recv);
    const comps = SB.getComponents(); const c = comps.find(x => x.id === o.componentId);
    if (c) { c.stock += o.qty; SB.saveComponents(comps); }
    SB.saveOrders(all.filter(x => x.id !== o.id));
    SB.refresh(); SB.toast('Stock updated for ' + o.name);
  });
}
SB.init('orders');
SB.onAuthChange(renderOrders);
renderOrders();
};
if (PAGES[document.body.dataset.page]) PAGES[document.body.dataset.page]();