(() => {
  "use strict";

  const KEY = "stockflow-complete-v1";
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(n) || 0);
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const id = prefix => prefix + "-" + Date.now().toString(36).toUpperCase()
    + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const now = () => new Date().toISOString();

  function demoData() {
    const products = [
      {id:"p1",sku:"PRD-001",name:"Air Mineral 600ml",category:"Minuman",cost:2500,price:4000,stock:48,min:10},
      {id:"p2",sku:"PRD-002",name:"Kopi Susu Botol",category:"Minuman",cost:7000,price:11000,stock:22,min:8},
      {id:"p3",sku:"PRD-003",name:"Roti Cokelat",category:"Makanan",cost:4500,price:7000,stock:5,min:8},
      {id:"p4",sku:"PRD-004",name:"Mi Instan",category:"Makanan",cost:2800,price:4000,stock:60,min:12},
      {id:"p5",sku:"PRD-005",name:"Sabun Mandi",category:"Perawatan",cost:5000,price:7500,stock:16,min:5}
    ];
    return {
      version:1, products,
      suppliers:[
        {id:"s1",name:"CV Sumber Jaya",contact:"Budi",phone:"081234567890",email:"sumber@example.com",address:"Jayapura"},
        {id:"s2",name:"UD Berkat Niaga",contact:"Maria",phone:"081298765432",email:"berkat@example.com",address:"Abepura, Jayapura"}
      ],
      purchases:[], sales:[],
      movements:products.map(p=>({
        id:id("MOV"),date:now(),productId:p.id,productName:p.name,
        type:"initial",qty:p.stock,before:0,after:p.stock,
        reference:"STOK-AWAL",user:"system"
      })),
      users:[
        {id:"u1",username:"admin",password:"admin123",role:"admin",active:true},
        {id:"u2",username:"kasir",password:"kasir123",role:"cashier",active:true}
      ],
      settings:{tax:0,storeName:"StockFlow Store"},theme:"light"
    };
  }

  function normalize(data) {
    data.suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
    data.products = Array.isArray(data.products) ? data.products : [];
    data.sales = Array.isArray(data.sales) ? data.sales : [];
    data.purchases = Array.isArray(data.purchases) ? data.purchases : [];
    data.movements = Array.isArray(data.movements) ? data.movements : [];
    data.users = Array.isArray(data.users) ? data.users : [];
    data.settings = {tax:0,storeName:"StockFlow Store",...(data.settings || {})};
    data.theme = data.theme || "light";
    data.products.forEach(p => {
      p.stock=Number(p.stock)||0; p.cost=Number(p.cost)||0;
      p.price=Number(p.price)||0; p.min=Number(p.min)||0;
    });
    return data;
  }

  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.users)) {
          return normalize(parsed);
        }
      }
    } catch (error) {
      console.warn("Tidak bisa membaca data lokal:", error);
    }
    const fresh = demoData();
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }

  let db = load();
  let currentUser = null;
  let cart = [];
  let toastTimer;

  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }
  function notify(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
  }
  function admin() { return currentUser?.role === "admin"; }
  function requireAdmin() {
    if (!admin()) notify("Fitur ini hanya tersedia untuk admin.");
    return admin();
  }
  function product(pid) { return db.products.find(p => p.id === pid); }
  function supplier(sid) { return db.suppliers.find(s => s.id === sid); }
  function roleName(role) { return role === "admin" ? "Administrator" : "Kasir"; }
  function empty(cols, message = "Belum ada data.") {
    return `<tr><td colspan="${cols}"><div class="empty">${esc(message)}</div></td></tr>`;
  }
  function dateLabel(value) {
    return value ? new Date(value).toLocaleString("id-ID", {
      dateStyle:"medium", timeStyle:"short"
    }) : "-";
  }
  function recordMovement(type, p, qty, before, after, reference) {
    db.movements.unshift({
      id:id("MOV"),date:now(),productId:p.id,productName:p.name,
      type,qty,before,after,reference,user:currentUser?.username || "system"
    });
  }

  function showPage(page) {
    const target = $("page-" + page);
    if (!target || (target.classList.contains("admin-only") && !admin())) return;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    target.classList.add("active");
    document.querySelectorAll(".nav-item").forEach(b =>
      b.classList.toggle("active", b.dataset.page === page));
    const titles = {
      dashboard:"Dashboard",products:"Produk",suppliers:"Supplier",
      purchases:"Pembelian & Stok Masuk",checkout:"Checkout",
      sales:"Riwayat Penjualan",movements:"Pergerakan Stok",
      reports:"Laporan & Grafik",users:"Pengguna",backup:"Backup & Pengaturan"
    };
    $("pageTitle").textContent = titles[page] || "StockFlow";
    renderAll();
  }

  function applyTheme() {
    document.body.classList.toggle("dark", db.theme === "dark");
    $("themeBtn").textContent = db.theme === "dark" ? "☀ Mode Terang" : "☾ Dark Mode";
  }

  function login(user) {
    currentUser = user;
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("sideUsername").textContent = user.username;
    $("sideRole").textContent = roleName(user.role);
    $("topUser").textContent = `${user.username} · ${roleName(user.role)}`;
    $("avatar").textContent = user.username.slice(0,1).toUpperCase();
    document.querySelectorAll(".admin-only").forEach(el =>
      el.classList.toggle("hidden", !admin()));
    $("purchaseDate").value = today();
    $("saleTax").value = Number(db.settings.tax) || 0;
    $("defaultTax").value = Number(db.settings.tax) || 0;
    $("todayLabel").textContent = new Date().toLocaleDateString("id-ID", {dateStyle:"full"});
    applyTheme();
    showPage("dashboard");
  }

  $("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    const username = $("loginUsername").value.trim().toLowerCase();
    const password = $("loginPassword").value;
    const user = db.users.find(u =>
      u.username.toLowerCase() === username &&
      u.password === password && u.active !== false
    );
    if (!user) {
      $("loginError").textContent = "Username atau password salah / akun tidak aktif.";
      return;
    }
    $("loginError").textContent = "";
    login(user);
  });

  $("logoutBtn").addEventListener("click", () => {
    if (cart.length && !confirm("Keranjang belum disimpan. Keluar?")) return;
    currentUser = null;
    cart = [];
    $("app").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
    $("loginPassword").value = "";
  });

  $("navigation").addEventListener("click", e => {
    const btn = e.target.closest("[data-page]");
    if (btn) showPage(btn.dataset.page);
  });

  document.addEventListener("click", e => {
    const go = e.target.closest("[data-page]");
    if (go && !go.classList.contains("nav-item")) {
      e.preventDefault();
      showPage(go.dataset.page);
    }
    const close = e.target.closest("[data-close]");
    if (close) $(close.dataset.close).classList.add("hidden");
  });

  $("themeBtn").addEventListener("click", () => {
    db.theme = db.theme === "dark" ? "light" : "dark";
    save();
    applyTheme();
  });

  function renderAll() {
    if (!currentUser) return;
    renderDashboard();
    renderProducts();
    renderSuppliers();
    renderPurchaseOptions();
    renderPurchases();
    renderCart();
    renderSales();
    renderMovements();
    renderReports();
    renderUsers();
    $("defaultTax").value = Number(db.settings.tax) || 0;
  }

  function renderDashboard() {
    $("statProducts").textContent = db.products.length;
    $("statStock").textContent = db.products.reduce((n,p)=>n+p.stock,0);
    $("statLow").textContent = db.products.filter(p=>p.stock<=p.min).length;
    const salesToday = db.sales.filter(s=>s.date.slice(0,10)===today());
    $("statRevenue").textContent = money(salesToday.reduce((n,s)=>n+s.total,0));

    const low = db.products.filter(p=>p.stock<=p.min).sort((a,b)=>a.stock-b.stock);
    $("lowStockList").innerHTML = low.length ? low.slice(0,8).map(p=>`
      <div class="row"><div><b>${esc(p.name)}</b><small>${esc(p.sku)} · stok ${p.stock}</small></div>
      <span class="badge ${p.stock===0?"out":"low"}">${p.stock===0?"Habis":"Menipis"}</span></div>
    `).join("") : `<div class="empty">Semua stok aman.</div>`;

    $("recentActivity").innerHTML = db.movements.slice(0,8).map(m=>`
      <div class="row"><div><b>${esc(m.productName)}</b><small>${esc(m.type)} · ${dateLabel(m.date)}</small></div>
      <span class="badge ${m.qty<0?"out":""}">${m.qty>0?"+":""}${m.qty}</span></div>
    `).join("") || `<div class="empty">Belum ada aktivitas.</div>`;
  }

  function renderProducts() {
    const search = ($("productSearch").value || "").toLowerCase();
    const selectedCategory = $("productCategoryFilter").value;
    const categories = [...new Set(db.products.map(p=>p.category).filter(Boolean))].sort();
    $("productCategoryFilter").innerHTML =
      `<option value="">Semua kategori</option>` +
      categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if (categories.includes(selectedCategory)) $("productCategoryFilter").value = selectedCategory;

    const category = $("productCategoryFilter").value;
    const rows = db.products.filter(p =>
      (!search || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(search)) &&
      (!category || p.category === category)
    );

    $("productTable").innerHTML = rows.map(p=>`
      <tr>
        <td><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></td>
        <td>${esc(p.category)}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td>${p.stock}</td>
        <td><span class="badge ${p.stock===0?"out":p.stock<=p.min?"low":""}">${p.stock===0?"Habis":p.stock<=p.min?"Menipis":"Aman"}</span></td>
        <td>${admin()?`<button class="btn" data-edit-product="${p.id}">Edit</button><button class="btn danger" data-delete-product="${p.id}">Hapus</button>`:"—"}</td>
      </tr>
    `).join("") || empty(7,"Produk tidak ditemukan.");
  }

  $("productSearch").addEventListener("input", renderProducts);
  $("productCategoryFilter").addEventListener("change", renderProducts);

  $("addProductBtn").addEventListener("click", () => {
    if (!requireAdmin()) return;
    $("productForm").reset();
    $("productId").value = "";
    $("productFormTitle").textContent = "Tambah Produk";
    $("productStock").disabled = false;
    $("productStock").value = 0;
    $("productMin").value = 5;
    $("productFormPanel").classList.remove("hidden");
  });

  $("productTable").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit-product]");
    const del = e.target.closest("[data-delete-product]");

    if (edit) {
      if (!requireAdmin()) return;
      const p = product(edit.dataset.editProduct);
      if (!p) return;
      $("productId").value = p.id;
      $("productSku").value = p.sku;
      $("productName").value = p.name;
      $("productCategory").value = p.category;
      $("productCost").value = p.cost;
      $("productPrice").value = p.price;
      $("productStock").value = p.stock;
      $("productStock").disabled = true;
      $("productMin").value = p.min;
      $("productFormTitle").textContent = "Edit Produk (stok lewat pembelian)";
      $("productFormPanel").classList.remove("hidden");
    }

    if (del) {
      if (!requireAdmin()) return;
      const p = product(del.dataset.deleteProduct);
      if (!p) return;
      const hasHistory = db.sales.some(s=>s.items.some(i=>i.productId===p.id)) ||
        db.purchases.some(x=>x.productId===p.id);
      if (hasHistory) return notify("Produk memiliki riwayat transaksi dan tidak dapat dihapus.");
      if (confirm(`Hapus produk ${p.name}?`)) {
        db.products = db.products.filter(x=>x.id!==p.id);
        save(); renderAll(); notify("Produk dihapus.");
      }
    }
  });

  $("productForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!requireAdmin()) return;
    const pid = $("productId").value;
    const sku = $("productSku").value.trim();
    const name = $("productName").value.trim();
    const category = $("productCategory").value.trim();
    const cost = Number($("productCost").value);
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);
    const min = Number($("productMin").value);

    if ([cost,price,stock,min].some(n=>!Number.isInteger(n)||n<0))
      return notify("Harga dan stok harus bilangan bulat non-negatif.");
    if (db.products.some(p=>p.sku.toLowerCase()===sku.toLowerCase()&&p.id!==pid))
      return notify("SKU sudah digunakan.");

    if (pid) {
      const p = product(pid);
      Object.assign(p,{sku,name,category,cost,price,min});
      notify("Produk diperbarui.");
    } else {
      const p = {id:id("PRD"),sku,name,category,cost,price,stock,min};
      db.products.push(p);
      if (stock) recordMovement("initial",p,stock,0,stock,"PRODUK-BARU");
      notify("Produk ditambahkan.");
    }
    $("productStock").disabled = false;
    $("productFormPanel").classList.add("hidden");
    save(); renderAll();
  });

  function renderSuppliers() {
    $("supplierTable").innerHTML = db.suppliers.map(s=>`
      <tr><td><b>${esc(s.name)}</b></td><td>${esc(s.contact||"-")}</td>
      <td>${esc(s.phone||"-")}</td><td>${esc(s.email||"-")}</td><td>${esc(s.address||"-")}</td>
      <td><button class="btn" data-edit-supplier="${s.id}">Edit</button><button class="btn danger" data-delete-supplier="${s.id}">Hapus</button></td></tr>
    `).join("") || empty(6,"Belum ada supplier.");
  }

  $("addSupplierBtn").addEventListener("click", () => {
    if (!requireAdmin()) return;
    $("supplierForm").reset(); $("supplierId").value="";
    $("supplierFormTitle").textContent="Tambah Supplier";
    $("supplierFormPanel").classList.remove("hidden");
  });

  $("supplierTable").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit-supplier]");
    const del = e.target.closest("[data-delete-supplier]");
    if (edit) {
      if (!requireAdmin()) return;
      const s = supplier(edit.dataset.editSupplier);
      if (!s) return;
      $("supplierId").value=s.id;
      $("supplierName").value=s.name;
      $("supplierContact").value=s.contact||"";
      $("supplierPhone").value=s.phone||"";
      $("supplierEmail").value=s.email||"";
      $("supplierAddress").value=s.address||"";
      $("supplierFormTitle").textContent="Edit Supplier";
      $("supplierFormPanel").classList.remove("hidden");
    }
    if (del) {
      if (!requireAdmin()) return;
      const sid=del.dataset.deleteSupplier;
      if (db.purchases.some(p=>p.supplierId===sid))
        return notify("Supplier memiliki riwayat pembelian dan tidak dapat dihapus.");
      if (confirm("Hapus supplier ini?")) {
        db.suppliers=db.suppliers.filter(s=>s.id!==sid);
        save();renderAll();notify("Supplier dihapus.");
      }
    }
  });

  $("supplierForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!requireAdmin()) return;
    const sid=$("supplierId").value;
    const data={
      name:$("supplierName").value.trim(),contact:$("supplierContact").value.trim(),
      phone:$("supplierPhone").value.trim(),email:$("supplierEmail").value.trim(),
      address:$("supplierAddress").value.trim()
    };
    if (sid) Object.assign(supplier(sid),data);
    else db.suppliers.push({id:id("SUP"),...data});
    save();$("supplierFormPanel").classList.add("hidden");renderAll();
    notify("Data supplier disimpan.");
  });

  function fillSelect(el, items, placeholder, label) {
    const old=el.value;
    el.innerHTML=`<option value="">${esc(placeholder)}</option>`+
      items.map(x=>`<option value="${esc(x.id)}">${esc(label(x))}</option>`).join("");
    if (items.some(x=>x.id===old)) el.value=old;
  }

  function renderPurchaseOptions() {
    fillSelect($("purchaseSupplier"),db.suppliers,"Pilih supplier",s=>s.name);
    fillSelect($("purchaseProduct"),db.products,"Pilih produk",p=>`${p.name} (stok ${p.stock})`);
    fillSelect($("cartProduct"),db.products.filter(p=>p.stock>0),"Pilih produk",p=>`${p.name} — ${money(p.price)} (stok ${p.stock})`);
  }

  $("purchaseProduct").addEventListener("change", () => {
    const p=product($("purchaseProduct").value);
    if (p) $("purchaseCost").value=p.cost;
  });

  $("purchaseForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!requireAdmin()) return;
    const s=supplier($("purchaseSupplier").value);
    const p=product($("purchaseProduct").value);
    const qty=Number($("purchaseQty").value);
    const cost=Number($("purchaseCost").value);
    const date=$("purchaseDate").value;

    if (!s||!p) return notify("Pilih supplier dan produk.");
    if (!date||!Number.isInteger(qty)||qty<=0||!Number.isInteger(cost)||cost<0)
      return notify("Tanggal, jumlah, atau harga modal tidak valid.");

    const before=p.stock;
    p.stock+=qty;
    p.cost=cost;
    const purchase={
      id:id("PO"),date:new Date(date+"T12:00:00").toISOString(),
      supplierId:s.id,supplierName:s.name,productId:p.id,
      productName:p.name,qty,cost,total:qty*cost,user:currentUser.username
    };
    db.purchases.unshift(purchase);
    recordMovement("purchase",p,qty,before,p.stock,purchase.id);
    save();renderAll();
    $("purchaseQty").value=1;$("purchaseDate").value=today();
    notify(`Stok ${p.name} bertambah ${qty}.`);
  });

  function renderPurchases() {
    $("purchaseTable").innerHTML=db.purchases.map(p=>`
      <tr><td>${esc(p.id)}</td><td>${new Date(p.date).toLocaleDateString("id-ID")}</td>
      <td>${esc(p.supplierName)}</td><td>${esc(p.productName)}</td><td>+${p.qty}</td>
      <td>${money(p.cost)}</td><td>${money(p.total)}</td><td>${esc(p.user)}</td></tr>
    `).join("")||empty(8,"Belum ada pembelian.");
  }

  function amounts() {
    const subtotal=cart.reduce((n,i)=>n+i.qty*i.price,0);
    const discount=Math.min(subtotal,Math.max(0,Number($("saleDiscount").value)||0));
    const rate=Math.min(100,Math.max(0,Number($("saleTax").value)||0));
    const tax=Math.round((subtotal-discount)*rate/100);
    return {subtotal,discount,rate,tax,total:subtotal-discount+tax};
  }

  function renderCart() {
    $("cartTable").innerHTML=cart.map(i=>`
      <tr><td><b>${esc(i.name)}</b><small>${esc(i.sku)}</small></td><td>${money(i.price)}</td>
      <td><input data-cart-qty="${i.productId}" type="number" min="1" step="1" value="${i.qty}" style="width:70px"></td>
      <td>${money(i.qty*i.price)}</td><td><button class="btn danger" data-remove-cart="${i.productId}">Hapus</button></td></tr>
    `).join("")||empty(5,"Keranjang masih kosong.");
    const a=amounts();
    $("checkoutSubtotal").textContent=money(a.subtotal);
    $("checkoutTax").textContent=money(a.tax);
    $("checkoutTotal").textContent=money(a.total);
    const paid=Math.max(0,Number($("salePaid").value)||0);
    $("saleChange").textContent=money(Math.max(0,paid-a.total));
    $("checkoutBtn").disabled=!cart.length;
  }

  $("cartAddForm").addEventListener("submit", e => {
    e.preventDefault();
    const p=product($("cartProduct").value);
    const qty=Number($("cartQty").value);
    if (!p) return notify("Pilih produk.");
    if (!Number.isInteger(qty)||qty<=0) return notify("Jumlah harus lebih dari nol.");
    const item=cart.find(i=>i.productId===p.id);
    if ((item?.qty||0)+qty>p.stock)
      return notify(`Stok ${p.name} tidak cukup. Tersedia ${p.stock}.`);
    if (item) item.qty+=qty;
    else cart.push({productId:p.id,name:p.name,sku:p.sku,price:p.price,qty});
    $("cartQty").value=1;
    renderCart();notify("Produk ditambahkan ke keranjang.");
  });

  $("cartTable").addEventListener("click", e => {
    const b=e.target.closest("[data-remove-cart]");
    if (b) {cart=cart.filter(i=>i.productId!==b.dataset.removeCart);renderCart();}
  });

  $("cartTable").addEventListener("change", e => {
    const input=e.target.closest("[data-cart-qty]");
    if (!input) return;
    const item=cart.find(i=>i.productId===input.dataset.cartQty);
    const p=product(input.dataset.cartQty);
    const qty=Number(input.value);
    if (!item||!p) return;
    if (!Number.isInteger(qty)||qty<1||qty>p.stock) {
      input.value=item.qty;return notify(`Jumlah tidak valid. Stok tersedia ${p.stock}.`);
    }
    item.qty=qty;renderCart();
  });

  $("clearCartBtn").addEventListener("click", () => {
    if (cart.length && confirm("Kosongkan keranjang?")) {cart=[];renderCart();}
  });
  ["saleDiscount","saleTax","salePaid"].forEach(k=>$(k).addEventListener("input",renderCart));

  $("checkoutBtn").addEventListener("click", () => {
    if (!cart.length) return notify("Keranjang kosong.");

    // Validasi ulang stok sebelum transaksi disimpan.
    for (const item of cart) {
      const p=product(item.productId);
      if (!p||!Number.isInteger(item.qty)||item.qty<=0||p.stock<item.qty) {
        renderPurchaseOptions();renderCart();
        return notify(`Stok ${item.name} tidak mencukupi. Transaksi dibatalkan.`);
      }
    }

    const a=amounts();
    const paid=Number($("salePaid").value)||0;
    if (!Number.isFinite(paid)||paid<a.total)
      return notify("Uang diterima harus sama atau lebih besar dari total.");

    const sale={
      id:id("INV"),date:now(),user:currentUser.username,
      items:cart.map(i=>({...i})),subtotal:a.subtotal,
      discount:a.discount,taxRate:a.rate,tax:a.tax,total:a.total,
      paid,change:paid-a.total
    };

    sale.items.forEach(item=>{
      const p=product(item.productId);
      const before=p.stock;
      p.stock-=item.qty;
      recordMovement("sale",p,-item.qty,before,p.stock,sale.id);
    });

    db.sales.unshift(sale);
    save();
    cart=[];
    $("saleDiscount").value=0;
    $("saleTax").value=Number(db.settings.tax)||0;
    $("salePaid").value=0;
    renderAll();
    openInvoice(sale.id);
    notify("Penjualan berhasil. Stok otomatis dikurangi.");
  });

  function renderSales() {
    const q=($("salesSearch").value||"").toLowerCase();
    const day=$("salesDateFilter").value;
    const list=db.sales.filter(s=>
      (!q||`${s.id} ${s.user}`.toLowerCase().includes(q))&&
      (!day||s.date.slice(0,10)===day)
    );
    $("salesTable").innerHTML=list.map(s=>`
      <tr><td><b>${esc(s.id)}</b></td><td>${dateLabel(s.date)}</td><td>${esc(s.user)}</td>
      <td>${s.items.reduce((n,i)=>n+i.qty,0)}</td><td>${money(s.subtotal)}</td>
      <td>${money(s.discount)}</td><td>${money(s.tax)}</td><td><b>${money(s.total)}</b></td>
      <td><button class="btn" data-invoice="${s.id}">Invoice</button></td></tr>
    `).join("")||empty(9,"Belum ada penjualan.");
  }
  $("salesSearch").addEventListener("input",renderSales);
  $("salesDateFilter").addEventListener("change",renderSales);
  $("salesTable").addEventListener("click",e=>{
    const b=e.target.closest("[data-invoice]");
    if (b) openInvoice(b.dataset.invoice);
  });

  function openInvoice(saleId) {
    const s=db.sales.find(x=>x.id===saleId);
    if (!s) return;
    $("invoiceContent").innerHTML=`
      <div class="invoice-head"><div><h2>${esc(db.settings.storeName)}</h2><small>Invoice penjualan</small></div>
      <div style="text-align:right"><b>${esc(s.id)}</b><br><small>${dateLabel(s.date)}</small></div></div>
      <div class="invoice-meta"><div><b>Kasir</b><br>${esc(s.user)}</div><div><b>Status</b><br>LUNAS</div></div>
      <table><thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead>
      <tbody>${s.items.map(i=>`<tr><td>${esc(i.name)}<small>${esc(i.sku)}</small></td><td>${money(i.price)}</td><td>${i.qty}</td><td>${money(i.price*i.qty)}</td></tr>`).join("")}</tbody></table>
      <div class="invoice-totals">
        <div><span>Subtotal</span><b>${money(s.subtotal)}</b></div>
        <div><span>Diskon</span><b>− ${money(s.discount)}</b></div>
        <div><span>Pajak (${s.taxRate}%)</span><b>${money(s.tax)}</b></div>
        <div class="grand"><span>Total</span><span>${money(s.total)}</span></div>
        <div><span>Dibayar</span><b>${money(s.paid)}</b></div>
        <div><span>Kembalian</span><b>${money(s.change)}</b></div>
      </div><div class="invoice-thanks">Terima kasih telah berbelanja.</div>`;
    $("invoiceModal").classList.remove("hidden");
  }

  $("closeInvoiceBtn").addEventListener("click",()=>$("invoiceModal").classList.add("hidden"));
  $("printInvoiceBtn").addEventListener("click",()=>window.print());
  $("invoiceModal").addEventListener("click",e=>{
    if (e.target===$("invoiceModal")) $("invoiceModal").classList.add("hidden");
  });

  function renderMovements() {
    const q=($("movementSearch").value||"").toLowerCase();
    const type=$("movementType").value;
    const labels={initial:"Stok awal",purchase:"Pembelian",sale:"Penjualan"};
    const list=db.movements.filter(m=>
      (!q||`${m.productName} ${m.reference} ${m.user}`.toLowerCase().includes(q))&&
      (!type||m.type===type)
    );
    $("movementTable").innerHTML=list.map(m=>`
      <tr><td>${dateLabel(m.date)}</td><td>${esc(m.productName)}</td><td>${labels[m.type]||esc(m.type)}</td>
      <td>${m.qty>0?"+":""}${m.qty}</td><td>${m.before}</td><td>${m.after}</td>
      <td>${esc(m.reference||"-")}</td><td>${esc(m.user||"-")}</td></tr>
    `).join("")||empty(8,"Belum ada pergerakan stok.");
  }
  $("movementSearch").addEventListener("input",renderMovements);
  $("movementType").addEventListener("change",renderMovements);

  function renderReports() {
    const revenue=db.sales.reduce((n,s)=>n+s.total,0);
    const units=db.sales.reduce((n,s)=>n+s.items.reduce((a,i)=>a+i.qty,0),0);
    $("reportRevenue").textContent=money(revenue);
    $("reportCount").textContent=db.sales.length;
    $("reportUnits").textContent=units;
    $("reportInventory").textContent=money(db.products.reduce((n,p)=>n+p.cost*p.stock,0));

    const days=[];
    for(let i=6;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i);
      const key=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
      days.push({key,label:d.toLocaleDateString("id-ID",{weekday:"short"}),value:db.sales.filter(s=>s.date.slice(0,10)===key).reduce((n,s)=>n+s.total,0)});
    }
    const max=Math.max(1,...days.map(d=>d.value));
    $("salesChart").innerHTML=days.map(d=>`
      <div class="chart-col"><em>${d.value?shortMoney(d.value):"—"}</em>
      <div class="chart-bar" style="height:${Math.max(3,d.value/max*105)}px" title="${money(d.value)}"></div>
      <small>${esc(d.label)}</small></div>
    `).join("");

    const totals={};
    db.sales.forEach(s=>s.items.forEach(i=>totals[i.name]=(totals[i.name]||0)+i.qty));
    const top=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const topMax=Math.max(1,...top.map(x=>x[1]));
    $("topProductsChart").innerHTML=top.length?`<div class="bar-list">${top.map(([name,qty])=>`
      <div class="bar-row"><span>${esc(name.length>18?name.slice(0,18)+"…":name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${qty/topMax*100}%"></div></div><b>${qty}</b></div>
    `).join("")}</div>`:`<div class="empty">Belum ada penjualan.</div>`;

    $("inventoryReportTable").innerHTML=db.products.map(p=>`
      <tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td>
      <td>${p.stock}</td><td>${money(p.cost)}</td><td>${money(p.stock*p.cost)}</td>
      <td>${p.stock===0?"Habis":p.stock<=p.min?"Menipis":"Aman"}</td></tr>
    `).join("")||empty(7);
  }

  function shortMoney(n) {
    if(n>=1000000)return "Rp"+(n/1000000).toFixed(1)+"jt";
    if(n>=1000)return "Rp"+Math.round(n/1000)+"rb";
    return "Rp"+n;
  }

  function renderUsers() {
    $("userTable").innerHTML=db.users.map(u=>`
      <tr><td><b>${esc(u.username)}</b>${u.id===currentUser.id?" (Anda)":""}</td>
      <td>${roleName(u.role)}</td><td>${u.active===false?"Nonaktif":"Aktif"}</td>
      <td>${u.id===currentUser.id?"—":`<button class="btn" data-toggle-user="${u.id}">${u.active===false?"Aktifkan":"Nonaktifkan"}</button><button class="btn danger" data-delete-user="${u.id}">Hapus</button>`}</td></tr>
    `).join("")||empty(4);
  }

  $("addUserBtn").addEventListener("click",()=>{
    if(requireAdmin()){$("userForm").reset();$("userFormPanel").classList.remove("hidden");}
  });
  $("userForm").addEventListener("submit",e=>{
    e.preventDefault();if(!requireAdmin())return;
    const username=$("newUsername").value.trim(),password=$("newPassword").value;
    if(username.length<3||password.length<4)return notify("Username minimal 3 karakter dan password minimal 4 karakter.");
    if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return notify("Username sudah digunakan.");
    db.users.push({id:id("USR"),username,password,role:$("newUserRole").value,active:true});
    save();$("userFormPanel").classList.add("hidden");renderAll();notify("Pengguna dibuat.");
  });
  $("userTable").addEventListener("click",e=>{
    const toggle=e.target.closest("[data-toggle-user]");
    const del=e.target.closest("[data-delete-user]");
    if(toggle){
      if(!requireAdmin())return;
      const u=db.users.find(x=>x.id===toggle.dataset.toggleUser);
      if(!u)return;
      u.active=u.active===false;
      save();renderUsers();notify("Status pengguna diperbarui.");
    }
    if(del){
      if(!requireAdmin())return;
      if(confirm("Hapus pengguna ini?")){
        db.users=db.users.filter(u=>u.id!==del.dataset.deleteUser);
        save();renderUsers();notify("Pengguna dihapus.");
      }
    }
  });

  function download(content,type,filename) {
    const blob=new Blob([content],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
  }
  function csv(rows) {
    return rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  }

  $("backupBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    download(JSON.stringify({...db,backupCreatedAt:now()},null,2),"application/json",`stockflow-backup-${today()}.json`);
    notify("Backup berhasil diunduh.");
  });
  $("importBtn").addEventListener("click",()=>{if(requireAdmin())$("importFile").click();});
  $("importFile").addEventListener("change",async e=>{
    if(!requireAdmin())return;
    const file=e.target.files?.[0];if(!file)return;
    try{
      const imported=normalize(JSON.parse(await file.text()));
      if(!Array.isArray(imported.products)||!Array.isArray(imported.users)||!Array.isArray(imported.suppliers)||!Array.isArray(imported.sales)||!Array.isArray(imported.movements))
        throw new Error("Struktur backup tidak lengkap.");
      if(!imported.users.some(u=>u.role==="admin"&&u.active!==false))
        throw new Error("Backup harus memiliki admin aktif.");
      if(!imported.products.every(p=>p.id&&p.sku&&p.name&&Number.isFinite(Number(p.stock))&&Number(p.stock)>=0))
        throw new Error("Data produk tidak valid.");
      if(!confirm("Import akan mengganti seluruh data saat ini. Lanjutkan?"))return;
      db=imported;save();cart=[];
      currentUser=db.users.find(u=>u.username===currentUser.username&&u.active!==false)||db.users.find(u=>u.role==="admin"&&u.active!==false);
      login(currentUser);notify("Import data berhasil.");
    }catch(err){notify("Import gagal: "+(err.message||"file tidak valid"));}
    finally{$("importFile").value="";}
  });

  $("resetDemoBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    if(confirm("Semua data akan diganti dengan data demo. Lanjutkan?")){
      db=demoData();save();cart=[];login(db.users[0]);notify("Data demo dipulihkan.");
    }
  });

  $("saveSettingsBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    const tax=Number($("defaultTax").value);
    if(!Number.isFinite(tax)||tax<0||tax>100)return notify("Pajak harus antara 0–100%.");
    db.settings.tax=tax;save();$("saleTax").value=tax;notify("Pengaturan disimpan.");
  });

  $("exportSalesBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    const rows=[["Invoice","Tanggal","Kasir","Unit","Subtotal","Diskon","Pajak","Total","Dibayar","Kembalian"],
      ...db.sales.map(s=>[s.id,s.date,s.user,s.items.reduce((n,i)=>n+i.qty,0),s.subtotal,s.discount,s.tax,s.total,s.paid,s.change])];
    download("\ufeff"+csv(rows),"text/csv;charset=utf-8",`stockflow-penjualan-${today()}.csv`);
  });
  $("exportMovementsBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    const rows=[["Tanggal","Produk","Jenis","Perubahan","Sebelum","Sesudah","Referensi","Pengguna"],
      ...db.movements.map(m=>[m.date,m.productName,m.type,m.qty,m.before,m.after,m.reference,m.user])];
    download("\ufeff"+csv(rows),"text/csv;charset=utf-8",`stockflow-pergerakan-${today()}.csv`);
  });
  $("exportReportBtn").addEventListener("click",()=>{
    if(!requireAdmin())return;
    const rows=[["SKU","Produk","Kategori","Stok","Harga Modal","Nilai Stok","Status"],
      ...db.products.map(p=>[p.sku,p.name,p.category,p.stock,p.cost,p.stock*p.cost,p.stock===0?"Habis":p.stock<=p.min?"Menipis":"Aman"])];
    download("\ufeff"+csv(rows),"text/csv;charset=utf-8",`stockflow-laporan-${today()}.csv`);
  });

  // Mulai dengan pilihan default dan render awal setelah login.
  renderPurchaseOptions();
})();