/* ===== Stock Board - shared logic (data, login, sidebar) ===== */
const SB = (() => {
  const KEY_C = 'sb_components', KEY_O = 'sb_orders', KEY_S = 'sb_session';
  const componentsRef = db.collection("components");
  const ordersRef = db.collection("orders");
  const historyRef = db.collection("history");

  const EMPLOYEES = [ 
    { user: 'Epick', pass: 'Epick bikes' }
  ];

  const SEED = [
    { id: 1, name: 'hdjd',    dept: 'electronics', stock: 78, minStock: 56, moq: 10, perDevice: 1, cost: 970, delivery: 9 },
    { id: 2, name: 'battery', dept: 'electronics', stock: 20, minStock: 4,  moq: 5,  perDevice: 1, cost: 230, delivery: 7 }
  ];

  const load = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };

  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* Detailed Activity Logger */
  const logActivity = async (actionText) => {
    try {
      const s = session();
      const userName = s ? s.user : 'Guest';
      await historyRef.add({
        action: actionText,
        user: userName,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to log activity:", e);
    }
  };

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

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    components.forEach(c => {
      const ref = componentsRef.doc(String(c.id));
      batch.set(ref, c);
    });

    await batch.commit();
  };

  const getOrders = async () => {
    const snapshot = await ordersRef.get();
    const orders = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id // Keep document ID as string for Firestore operations
    }));
    try { localStorage.setItem('sb_orders_count_v1', String(orders.length)); } catch (e) {}
    return orders;
  };

  const saveOrders = async (orders) => {
    const batch = db.batch();

    orders.forEach(o => {
      const ref = ordersRef.doc(String(o.id));
      batch.set(ref, o);
    });

    await batch.commit();
    try { localStorage.setItem('sb_orders_count_v1', String(orders.length)); } catch (e) {}
  };

  const session = () => load(KEY_S, null);
  const isEmployee = () => !!session();

  const status = c => c.stock < c.minStock ? 'critical' : (c.stock < c.minStock * 1.25 ? 'low' : 'stocked');
  const statusLabel = { critical: 'CRITICAL', low: 'LOW', stocked: 'STOCKED' };

  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const money = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let toastTimer;
  const toast = msg => {
    const t = document.getElementById('toast'); if(!t) return; t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  const listeners = [];
  const onAuthChange = fn => listeners.push(fn);

  const NAV = [
    { key: 'dashboard',  href: 'index.html',     icon: 'fa-table-cells-large', label: 'Dashboard' },
    { key: 'production',  href: 'production.html', icon: 'fa-industry',             label: 'Production Details' },
    { key: 'components',  href: 'components.html', icon: 'fa-cube',                 label: 'Components' },
    { key: 'orders',       href: 'orders.html',     icon: 'fa-truck',                label: 'Orders' },
    { key: 'history',     href: 'history.html',    icon: 'fa-clock-rotate-left',     label: 'History' }
  ];

  function renderSidebar(active) {
    const s = session();
    const cachedCount = localStorage.getItem('sb_orders_count_v1') || '0';
    const sbEl = document.getElementById('sidebar');
    if (!sbEl) return;
    sbEl.innerHTML = `
      <div class="brand"><i class="fa-solid fa-box-open"></i>
        <div><h1>Stock Board</h1><p>One device, every part</p></div></div>
      <nav class="nav">${NAV.map(n => `
        <a href="${n.href}" class="${n.key === active ? 'active' : ''}">
          <i class="fa-solid ${n.icon}"></i><span>${n.label}</span>${n.key === 'orders' ? `<span class="badge" id="orderBadge">${cachedCount}</span>` : ''}
        </a>`).join('')}</nav>
      <div class="sidebar-foot">
        ${s ? `<div class="who">Signed in as <b>${esc(s.user)}</b></div>` : ''}
        <button class="login-btn" id="authBtn">
          <i class="fa-solid ${s ? 'fa-right-from-bracket' : 'fa-user-lock'}"></i>${s ? 'Log Out' : 'Log In'}
        </button>
      </div>`;
    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.onclick = () => s ? logout() : openLogin();

    ordersRef.get().then(snapshot => {
      const badge = document.getElementById('orderBadge');
      if (badge) {
        badge.textContent = snapshot.size;
        try { localStorage.setItem('sb_orders_count_v1', String(snapshot.size)); } catch (e) {}
      }
    }).catch(() => {});
  }

  function injectShell(active) {
    if (!document.getElementById('loginOverlay')) {
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
      const cancelBtn = document.getElementById('lCancel');
      if (cancelBtn) cancelBtn.onclick = closeLogin;
      const overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.onclick = e => { if (e.target.id === 'loginOverlay') closeLogin(); };
      const form = document.getElementById('loginForm');
      if (form) {
        form.onsubmit = e => {
          e.preventDefault();
          const u = document.getElementById('lUser').value.trim(), p = document.getElementById('lPass').value;
          const ok = EMPLOYEES.find(x => x.user === u && x.pass === p);
          if (!ok) { document.getElementById('lError').textContent = 'Wrong username or password.'; return; }
          save(KEY_S, { user: ok.user });
          logActivity('User Logged In');
          closeLogin(); refresh(active); toast('Welcome, ' + ok.user);
        };
      }
    }
    const main = document.querySelector('.main');
    if (main && !document.querySelector('.topbar')) {
      main.insertAdjacentHTML('beforebegin',
        `<div class="topbar"><button id="menuBtn" aria-label="Menu"><i class="fa-solid fa-bars"></i></button><b>Stock Board</b></div>`);
      const menuBtn = document.getElementById('menuBtn');
      if (menuBtn) menuBtn.onclick = () => {
        const sb = document.getElementById('sidebar');
        if (sb) sb.classList.toggle('open');
      };
    }
  }

  const openLogin = () => { 
    const err = document.getElementById('lError');
    if(err) err.textContent = ''; 
    const form = document.getElementById('loginForm');
    if(form) form.reset(); 
    const overlay = document.getElementById('loginOverlay');
    if(overlay) overlay.classList.add('open'); 
    const lUser = document.getElementById('lUser');
    if(lUser) lUser.focus(); 
  };
  const closeLogin = () => {
    const overlay = document.getElementById('loginOverlay');
    if(overlay) overlay.classList.remove('open');
  };
  let currentPage = '';
  function logout() {
    logActivity('User Logged Out');
    localStorage.removeItem(KEY_S);
    refresh(currentPage);
    toast('Logged out');
  }
  function refresh(active) { renderSidebar(active); listeners.forEach(fn => fn()); }

  function init(active) {
    currentPage = active;
    injectShell(active);
    refresh(active);
  }

  return { init, getComponents, saveComponents, getOrders, saveOrders, isEmployee, status, statusLabel,
           addDays, fmtDate, money, esc, toast, onAuthChange, logActivity, refresh: () => refresh(currentPage) };
})();

/* ===== Page scripts ===== */
const PAGES = {};

PAGES.dashboard = function () {
  async function renderDashboard() {
    const comps = await SB.getComponents();
    const critical = comps.filter(c => SB.status(c) === 'critical');
    const low = comps.filter(c => SB.status(c) === 'low');
    const ok = comps.filter(c => SB.status(c) === 'stocked');
    const today = new Date();
    const longest = critical.reduce((m, c) => Math.max(m, c.delivery), 0);

    const big = document.getElementById('bigCount');
    if (big) {
      big.textContent = critical.length;
      big.classList.toggle('alert', critical.length > 0);
    }
    const longestEl = document.getElementById('longest');
    if (longestEl) longestEl.textContent = critical.length ? SB.fmtDate(SB.addDays(today, longest)) : 'N/A';
    
    const fillEl = document.getElementById('fill');
    if (fillEl) fillEl.style.width = critical.length ? Math.min(longest / 45 * 100, 100) + '%' : '0';

    const t0 = document.getElementById('t0');
    if (t0) t0.textContent = SB.fmtDate(today);
    [15, 30, 45].forEach(n => {
      const el = document.getElementById('t' + n);
      if (el) el.textContent = '+' + n + ' days';
    });

    const sTotal = document.getElementById('sTotal');
    const sCrit = document.getElementById('sCrit');
    const sLow = document.getElementById('sLow');
    const sOk = document.getElementById('sOk');
    if (sTotal) sTotal.textContent = comps.length;
    if (sCrit) sCrit.textContent = critical.length;
    if (sLow) sLow.textContent = low.length;
    if (sOk) sOk.textContent = ok.length;

    const list = [...critical, ...low];
    const alertsEl = document.getElementById('alerts');
    if (alertsEl) {
      alertsEl.innerHTML = list.length
        ? list.map(c => { const s = SB.status(c); return `
            <div class="alert-row">
              <div><strong>${SB.esc(c.name)}</strong><br><small>${SB.esc(c.dept)} · Stock ${c.stock} / Alert Stock ${c.minStock} · Delivery ${c.delivery}d</small></div>
              <span class="tag ${s}">${SB.statusLabel[s]}</span>
            </div>`; }).join('')
        : '<div class="empty">No immediate stock warnings right now.</div>';
    }
  }
  SB.init('dashboard');
  SB.onAuthChange(renderDashboard);
  renderDashboard();
};

PAGES.production = function () {
  const input = document.getElementById('orderCount');
  if(!input) return;

  async function renderProduction() {
    const emp = SB.isEmployee();
    const n = parseInt(input.value, 10);
    const body = document.getElementById('prodBody');
    if(!body) return;
    const cols = emp ? 8 : 7;
    const actionTh = document.getElementById('actionTh');
    if(actionTh) actionTh.classList.toggle('hidden', !emp);

    if (!n || n < 1) {
      body.innerHTML = `<tr><td colspan="${cols}" class="empty">Enter the number of orders above to calculate requirements.</td></tr>`;
      return;
    }
    const comps = await SB.getComponents();
    let total = 0, maxDays = 0;
    const rows = comps.map(c => {
      const required = n * c.perDevice;
      const shortage = Math.max(0, required - c.stock);
      
      const itemMoq = Number(c.moq) || 1;
      const orderQty = shortage > 0 ? Math.max(shortage, itemMoq) : 0;
      
      const cost = orderQty * c.cost;
      total += cost; if (orderQty) maxDays = Math.max(maxDays, c.delivery);
      
      return `<tr>
        <td><b>${SB.esc(c.name)}</b></td>
        <td>${c.stock}</td>
        <td class="${shortage ? 'short' : 'ok'}">${required}</td>
        <td>${itemMoq}</td>
        <td>${SB.money(c.cost)}</td>
        <td>${orderQty ? SB.money(cost) : '—'}</td>
        <td>${orderQty ? SB.fmtDate(SB.addDays(new Date(), c.delivery)) : 'In stock'}</td>
        ${emp ? `<td>${orderQty ? `<button class="btn sm primary" data-order="${c.id}" data-qty="${orderQty}">Order ${orderQty}</button>` : ''}</td>` : ''}
      </tr>`;
    }).join('');
    
    body.innerHTML = rows + `<tr class="total-row"><td colspan="5">Total to order</td><td>${SB.money(total)}</td>
      <td>${total ? SB.fmtDate(SB.addDays(new Date(), maxDays)) : '—'}</td>${emp ? '<td></td>' : ''}</tr>`;

    body.querySelectorAll('[data-order]').forEach(b => b.onclick = async () => {
      const allComps = await SB.getComponents();
      const c = allComps.find(x => x.id === +b.dataset.order);
      const orders = await SB.getOrders();
      const newOrderId = String(Date.now());
      orders.push({ id: newOrderId, componentId: c.id, name: c.name, qty: +b.dataset.qty,
                    orderDate: new Date().toISOString(), expected: SB.addDays(new Date(), c.delivery).toISOString() });
      await SB.saveOrders(orders);
      await SB.logActivity(`Placed Order: [${c.name}] Quantity: ${b.dataset.qty} units (Vendor: ${c.vendor || '—'})`);
      SB.refresh(); 
      SB.toast('Order placed for ' + c.name);
    });
  }
  input.oninput = renderProduction;
  SB.init('production');
  SB.onAuthChange(renderProduction);
  renderProduction();
};

PAGES.components = function () {
  let editingId = null;

  async function renderComponents() {
    const emp = SB.isEmployee();

    const addBtnWrap = document.getElementById('addBtnWrap');
    if(addBtnWrap) addBtnWrap.classList.toggle('hidden', !emp);

    const searchInput = document.getElementById('search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

    try {
      const allComponents = await SB.getComponents();

      const comps = allComponents.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.dept.toLowerCase().includes(q) ||
        (c.vendor && c.vendor.toLowerCase().includes(q))
      );

      const groups = {};

      comps.forEach(c => {
        if (!groups[c.dept]) {
          groups[c.dept] = [];
        }
        groups[c.dept].push(c);
      });

      const depts = Object.keys(groups).sort();
      const listEl = document.getElementById('list');
      if(!listEl) return;

      listEl.innerHTML = depts.length
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
                    <th class="num">Alert Stock</th>
                    <th class="num">Cost (₹)</th>
                    <th class="num">Delivery</th>
                    <th>Vendor</th>
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
                          ${c.minStock ?? 0}
                        </td>

                        <td class="num">
                          ${SB.money(c.cost)}
                        </td>

                        <td class="num">
                          ${c.delivery}d
                        </td>

                        <td>
                          ${SB.esc(c.vendor || '—')}
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
      const listEl = document.getElementById('list');
      if(listEl) listEl.innerHTML = '<div class="card empty">Unable to load components from Firebase.</div>';
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
        minStock: 0,
        moq: 1,
        perDevice: 1,
        cost: 0,
        delivery: 1,
        vendor: ''
      };
    }

    const titleEl = document.getElementById('formTitle');
    if(titleEl) titleEl.textContent = id ? 'Edit component' : 'Add component';

    const f = document.getElementById('compForm');
    if(!f) return;

    f.elements['name'].value = c.name || '';
    f.elements['dept'].value = c.dept || '';
    f.elements['stock'].value = c.stock ?? 0;
    f.elements['minStock'].value = c.minStock ?? 0;
    f.elements['moq'].value = c.moq ?? 1;
    f.elements['perDevice'].value = c.perDevice ?? 1;
    f.elements['cost'].value = c.cost ?? 0;
    f.elements['delivery'].value = c.delivery ?? 1;
    if (f.elements['vendor']) f.elements['vendor'].value = c.vendor || '';

    const overlay = document.getElementById('formOverlay');
    if(overlay) overlay.classList.add('open');
  }

  const closeForm = () => {
    const overlay = document.getElementById('formOverlay');
    if(overlay) overlay.classList.remove('open');
  };

  async function removeComp(id) {
    if (!SB.isEmployee()) return;
    if (!confirm('Delete this component?')) return;

    try {
      const components = await SB.getComponents();
      const target = components.find(c => c.id === id);
      const updatedComponents = components.filter(c => c.id !== id);
      await SB.saveComponents(updatedComponents);

      const orders = await SB.getOrders();
      const updatedOrders = orders.filter(o => o.componentId !== id);
      await SB.saveOrders(updatedOrders);

      if (target) {
        await SB.logActivity(`Deleted Component: [${target.name}] (Dept: ${target.dept}, Stock was: ${target.stock})`);
      }

      await renderComponents();
      SB.toast('Component deleted');

    } catch (error) {
      console.error("Delete error:", error);
      SB.toast('Unable to delete component');
    }
  }

  const formEl = document.getElementById('compForm');
  if(formEl) {
    formEl.onsubmit = async e => {
      e.preventDefault();
      if (!SB.isEmployee()) return;

      const f = e.target.elements;
      const data = {
        name: f.name.value.trim(),
        dept: f.dept.value.trim(),
        stock: +f.stock.value,
        minStock: +f.minStock.value,
        moq: +f.moq.value,
        perDevice: +f.perDevice.value,
        cost: +f.cost.value,
        delivery: +f.delivery.value,
        vendor: f.vendor ? f.vendor.value.trim() : ''
      };

      try {
        const all = await SB.getComponents();

        if (editingId) {
          const index = all.findIndex(c => c.id === editingId);
          let changes = [];

          if (index !== -1) {
            const old = all[index];
            ['stock', 'minStock', 'moq', 'cost', 'delivery', 'vendor', 'name', 'dept'].forEach(key => {
              if (old[key] !== data[key]) {
                changes.push(`${key}: ${old[key]} → ${data[key]}`);
              }
            });

            all[index] = { ...old, ...data };
          }

          await SB.saveComponents(all);
          const changeDesc = changes.length > 0 ? changes.join(', ') : 'No property changes';
          await SB.logActivity(`Edited Component [${data.name}] — Changes: ${changeDesc}`);
          closeForm();
          await renderComponents();
          SB.toast('Component updated');

        } else {
          const newComponent = { id: Date.now(), ...data };
          all.push(newComponent);
          await SB.saveComponents(all);
          await SB.logActivity(`Added New Component: [${data.name}] (Dept: ${data.dept}, Stock: ${data.stock}, MOQ: ${data.moq}, Cost: ₹${data.cost})`);
          closeForm();
          await renderComponents();
          SB.toast('Component added');
        }

      } catch (error) {
        console.error("Save component error:", error);
        SB.toast('Unable to save component');
      }
    };
  }

  const addBtn = document.getElementById('addBtn');
  if(addBtn) addBtn.onclick = () => openForm();

  const cancelForm = document.getElementById('cancelForm');
  if(cancelForm) cancelForm.onclick = closeForm;

  const formOverlay = document.getElementById('formOverlay');
  if(formOverlay) formOverlay.onclick = e => { if (e.target.id === 'formOverlay') closeForm(); };

  const searchInput = document.getElementById('search');
  if(searchInput) searchInput.oninput = renderComponents;

  SB.init('components');
  SB.onAuthChange(renderComponents);
  renderComponents();
};

PAGES.orders = function () {
  async function renderOrders() {
    const emp = SB.isEmployee();
    const orders = await SB.getOrders();
    const actionTh = document.getElementById('actionTh');
    if (actionTh) actionTh.classList.toggle('hidden', !emp);
    const body = document.getElementById('orderBody');
    if (!body) return;
    
    body.innerHTML = orders.length ? orders.map(o => `
      <tr>
        <td><b>${SB.esc(o.name)}</b></td>
        <td>${o.qty}</td>
        <td>${SB.fmtDate(o.orderDate)}</td>
        <td>${SB.fmtDate(o.expected)}</td>
        ${emp ? `
          <td style="text-align:center">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px">
              <button class="btn sm" data-edit="${o.id}" data-qty="${o.qty}">Edit</button>
              <button class="btn sm primary" style="background:#2fb344;border-color:#2fb344;color:#fff" data-recv="${o.id}"><i class="fa-solid fa-check"></i> Receive</button>
              <button title="Delete order" style="background:none;border:none;color:#ff4d4f;cursor:pointer;font-size:14px" data-del="${o.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>` : ''}
      </tr>`).join('')
      : `<tr><td colspan="${emp ? 5 : 4}" class="empty empty-orders"><i class="fa-solid fa-box-open"></i>No active purchase orders.</td></tr>`;

    // Handle Edit Order Quantity
    body.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
      if (!SB.isEmployee()) return;
      const orderId = b.dataset.edit;
      const currentQty = parseInt(b.dataset.qty, 10);
      const inputVal = prompt("Enter new order quantity:", currentQty);
      if (inputVal === null) return;
      const newQty = parseInt(inputVal, 10);
      if (!newQty || newQty < 1) { alert("Please enter a valid quantity."); return; }

      try {
        const orderRef = db.collection("orders").doc(String(orderId));
        const snap = await orderRef.get();
        const compName = snap.exists ? (snap.data().name || "Unknown") : "Unknown";

        await orderRef.update({ qty: newQty });
        await SB.logActivity(`Edited Order Quantity: [${compName}] — Quantity: ${currentQty} → ${newQty} units`);
        SB.toast('Order quantity updated');
        SB.refresh();
      } catch (e) {
        console.error(e);
        alert("Unable to update order quantity.");
      }
    });

    // Handle Receive Order
    body.querySelectorAll('[data-recv]').forEach(b => b.onclick = async () => {
      if (!SB.isEmployee()) return;
      if (!confirm("Mark this order as received?")) return;
      
      try {
        const orderId = b.dataset.recv;
        const orderRef = db.collection("orders").doc(String(orderId));
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) { alert("Order not found."); return; }

        const orderData = orderSnap.data();
        const compName = orderData.name;
        const orderQty = Number(orderData.qty) || 0;

        const comps = await SB.getComponents();
        const c = comps.find(x => x.id === orderData.componentId || x.name === compName);
        let oldStock = c ? c.stock : 0;
        let newStock = oldStock + orderQty;

        if (c) {
          c.stock = newStock;
          await SB.saveComponents(comps);
          await SB.logActivity(`Received Order: [${compName}] — Stock updated: ${oldStock} → ${newStock} (+${orderQty} units added)`);
        } else {
          await SB.logActivity(`Received Order (No matching inventory): [${compName}] — Quantity: ${orderQty}`);
        }

        await orderRef.delete();
        SB.toast('Stock updated for ' + compName);
        SB.refresh();
      } catch (e) {
        console.error("Receive error:", e);
        alert("Unable to process order receipt.");
      }
    });

    // Handle Delete Order
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!SB.isEmployee()) return;
      if (!confirm("Delete this order?")) return;

      try {
        const orderId = b.dataset.del;
        const orderRef = db.collection("orders").doc(String(orderId));
        const snap = await orderRef.get();
        if (snap.exists) {
          const ord = snap.data();
          await SB.logActivity(`Deleted Active Order: [${ord.name}] — Quantity: ${ord.qty} units`);
        }
        await orderRef.delete();
        SB.toast('Order deleted');
        SB.refresh();
      } catch (e) {
        console.error("Delete order error:", e);
        alert("Unable to delete order.");
      }
    });
  }
  SB.init('orders');
  SB.onAuthChange(renderOrders);
  renderOrders();
};

PAGES.history = function () {
  SB.init('history');
};

if (PAGES[document.body.dataset.page]) PAGES[document.body.dataset.page]();