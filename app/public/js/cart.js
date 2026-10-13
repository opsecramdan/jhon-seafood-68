(function () {
  const CART_KEY = 'jhonseafood_cart';

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function formatRp(n) {
    return 'Rp ' + n.toLocaleString('id-ID');
  }

  function cartTotal(cart) {
    return cart.reduce((sum, it) => sum + it.price * it.qty, 0);
  }

  function renderFab(cart) {
    const count = cart.reduce((sum, it) => sum + it.qty, 0);
    document.getElementById('cart-count').textContent = count;
    document.getElementById('cart-total').textContent = formatRp(cartTotal(cart));
  }

  function renderPanel(cart) {
    const itemsEl = document.getElementById('cart-items');
    const emptyEl = document.getElementById('cart-empty');
    const checkoutBtn = document.getElementById('checkout-btn');

    itemsEl.innerHTML = '';
    if (cart.length === 0) {
      emptyEl.style.display = 'block';
      checkoutBtn.disabled = true;
    } else {
      emptyEl.style.display = 'none';
      checkoutBtn.disabled = false;
      cart.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'cart-row';
        row.innerHTML =
          '<span class="cart-row-name">' + it.name + '</span>' +
          '<input type="number" min="1" value="' + it.qty + '" class="cart-row-qty" data-idx="' + idx + '">' +
          '<span class="cart-row-sub">' + formatRp(it.price * it.qty) + '</span>' +
          '<button type="button" class="cart-row-remove" data-idx="' + idx + '">&times;</button>';
        itemsEl.appendChild(row);
      });
    }

    const total = cartTotal(cart);
    document.getElementById('cart-total-2').textContent = formatRp(total);
    document.getElementById('items-input').value = JSON.stringify(
      cart.map((it) => ({ id: it.id, qty: it.qty }))
    );
  }

  function render() {
    const cart = loadCart();
    renderFab(cart);
    renderPanel(cart);
  }

  document.addEventListener('DOMContentLoaded', function () {
    render();

    document.querySelectorAll('.btn-add-cart').forEach((btn) => {
      btn.addEventListener('click', function () {
        const item = btn.closest('.menu-item');
        const id = parseInt(item.dataset.id, 10);
        const name = item.dataset.name;
        const price = parseInt(item.dataset.price, 10);
        const qty = Math.max(1, parseInt(item.querySelector('.qty-input').value, 10) || 1);

        const cart = loadCart();
        const existing = cart.find((it) => it.id === id);
        if (existing) existing.qty += qty;
        else cart.push({ id, name, price, qty });

        saveCart(cart);
        render();
        btn.textContent = '✓ Ditambahkan';
        setTimeout(() => (btn.textContent = '+ Pesan'), 1000);
      });
    });

    document.getElementById('cart-fab').addEventListener('click', function () {
      document.getElementById('cart-panel').classList.remove('hidden');
    });
    document.getElementById('cart-close').addEventListener('click', function () {
      document.getElementById('cart-panel').classList.add('hidden');
    });

    document.getElementById('cart-items').addEventListener('input', function (e) {
      if (e.target.classList.contains('cart-row-qty')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        const cart = loadCart();
        cart[idx].qty = Math.max(1, parseInt(e.target.value, 10) || 1);
        saveCart(cart);
        render();
      }
    });

    document.getElementById('cart-items').addEventListener('click', function (e) {
      if (e.target.classList.contains('cart-row-remove')) {
        const idx = parseInt(e.target.dataset.idx, 10);
        const cart = loadCart();
        cart.splice(idx, 1);
        saveCart(cart);
        render();
      }
    });

    document.getElementById('checkout-form').addEventListener('submit', function () {
      localStorage.removeItem(CART_KEY);
    });
  });
})();
