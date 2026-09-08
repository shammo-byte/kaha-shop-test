/* ------------------------------------------------------------------
   Kaha Mind — shop checkout
   Product -> delivery -> payment (Razorpay Checkout) -> confirmation.

   The price here is only for display. The amount actually charged is
   computed on the server in create-order.php, so editing this file in
   a browser cannot change what anyone pays.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var CONFIG = {
    // Your Apps Script web app URL. Must end in /exec.
    apiUrl: "https://script.google.com/macros/s/AKfycbx_omG3DNe6IKOzKkTgsdm54GY4ib9rE4iE0wOu1YzHq94Da_nuMz5tWiB5rjXAbJd-fw/exec",
    productId: "metal-health-cap",
    productName: "Metal Health Cap",
    unitPrice: 1499,     // rupees, display only
    shipping: 0,         // rupees, 0 = free
    maxQty: 10,
    themeColor: "#EC6454"
  };

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var steps = {
    product: $("stepProduct"),
    delivery: $("stepDelivery"),
    payment: $("stepPayment"),
    done: $("stepDone")
  };
  if (!steps.product) return;

  var state = {
    qty: 1,
    customer: null,
    order: null,      // { orderRef, razorpayOrderId, amount, keyId }
    paying: false
  };

  /* ---------------------------------------------------------- helpers */

  function inr(n) {
    return Number(n).toLocaleString("en-IN");
  }

  function total() {
    return state.qty * CONFIG.unitPrice + CONFIG.shipping;
  }

  function showError(el, message) {
    if (!el) return;
    if (message) {
      el.textContent = message;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function goTo(name) {
    Object.keys(steps).forEach(function (key) {
      if (steps[key]) steps[key].hidden = (key !== name);
    });
    var target = steps[name];
    if (!target) return;
    // reveal animations run on [data-reveal]; make sure a re-shown step is visible
    $$("[data-reveal]", target).forEach(function (el) { el.classList.add("is-visible"); });
    var top = target.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: top < 0 ? 0 : top, behavior: "smooth" });
  }

  /* ------------------------------------------------------- quantity */

  var qtyInput = $("qty");

  function setQty(n) {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > CONFIG.maxQty) n = CONFIG.maxQty;
    state.qty = n;
    if (qtyInput) qtyInput.value = n;
    render();
  }

  function render() {
    var t = total();
    var qtyTotal = $("qtyTotalLabel");
    if (qtyTotal) qtyTotal.textContent = inr(t);

    var payLabel = $("payAmountLabel");
    if (payLabel) payLabel.textContent = inr(t);

    $$("[data-summary]").forEach(function (el) {
      switch (el.getAttribute("data-summary")) {
        case "name":     el.textContent = CONFIG.productName; break;
        case "unit":     el.textContent = inr(CONFIG.unitPrice); break;
        case "qty":      el.textContent = state.qty; break;
        case "subtotal": el.textContent = inr(state.qty * CONFIG.unitPrice); break;
        case "shipping": el.textContent = CONFIG.shipping ? "\u20B9" + inr(CONFIG.shipping) : "Free"; break;
        case "total":    el.textContent = inr(t); break;
      }
    });

    var minus = $("qtyMinus"), plus = $("qtyPlus");
    if (minus) minus.disabled = state.qty <= 1;
    if (plus) plus.disabled = state.qty >= CONFIG.maxQty;
  }

  if ($("qtyMinus")) $("qtyMinus").addEventListener("click", function () { setQty(state.qty - 1); });
  if ($("qtyPlus")) $("qtyPlus").addEventListener("click", function () { setQty(state.qty + 1); });
  if (qtyInput) {
    qtyInput.addEventListener("input", function () { setQty(qtyInput.value); });
    qtyInput.addEventListener("blur", function () { setQty(qtyInput.value); });
  }

  $$("[data-summary-edit]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goTo("product");
      if (qtyInput) qtyInput.focus();
    });
  });

  /* ------------------------------------------------- step navigation */

  if ($("goToDelivery")) {
    $("goToDelivery").addEventListener("click", function () { goTo("delivery"); });
  }
  if ($("backToProduct")) {
    $("backToProduct").addEventListener("click", function () { goTo("product"); });
  }
  if ($("backToDelivery")) {
    $("backToDelivery").addEventListener("click", function () { goTo("delivery"); });
  }
  if ($("shopAgain")) {
    $("shopAgain").addEventListener("click", function () {
      state.customer = null;
      state.order = null;
      setQty(1);
      var form = $("deliveryForm");
      if (form) form.reset();
      goTo("product");
    });
  }

  /* -------------------------------------------------- delivery form */

  var deliveryForm = $("deliveryForm");
  var deliveryError = $("deliveryError");

  function readDelivery() {
    return {
      name: ($("custName").value || "").trim(),
      email: ($("custEmail").value || "").trim(),
      phone: ($("custPhone").value || "").replace(/\D/g, ""),
      address1: ($("addr1").value || "").trim(),
      address2: ($("addr2").value || "").trim(),
      city: ($("city").value || "").trim(),
      state: $("state").value || "",
      pincode: ($("pincode").value || "").replace(/\D/g, ""),
      notes: ($("deliveryNotes").value || "").trim()
    };
  }

  function firstProblem(d) {
    if (d.name.length < 2) return ["Enter your full name.", "custName"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return ["Enter an email address we can send the confirmation to.", "custEmail"];
    if (!/^[6-9]\d{9}$/.test(d.phone)) return ["Enter a 10-digit Indian mobile number.", "custPhone"];
    if (d.address1.length < 5) return ["Enter the house or flat number, building and street.", "addr1"];
    if (d.city.length < 2) return ["Enter your city.", "city"];
    if (!d.state) return ["Choose your state.", "state"];
    if (!/^\d{6}$/.test(d.pincode)) return ["Enter a 6-digit PIN code.", "pincode"];
    return null;
  }

  if (deliveryForm) {
    deliveryForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = readDelivery();
      var problem = firstProblem(d);
      if (problem) {
        showError(deliveryError, problem[0]);
        var field = $(problem[1]);
        if (field) field.focus();
        return;
      }
      showError(deliveryError, null);
      state.customer = d;
      state.order = null;          // details changed, so any old order is stale
      render();
      goTo("payment");
    });
  }

  /* ------------------------------------------------------- payment */

  var payBtn = $("payNow");
  var paymentError = $("paymentError");
  var payFallback = $("payFallback");

  /*
     Apps Script can't answer a CORS preflight, so this has to stay a
     "simple" request: text/plain content type, no custom headers. The
     body is still JSON and the script still parses it as JSON.
  */
  function post(action, body) {
    body.action = action;
    return fetch(CONFIG.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () {
        throw new Error("The server sent something we couldn't read.");
      }).then(function (data) {
        if (!res.ok || data.ok === false) {
          throw new Error(data && data.error ? data.error : "Something went wrong at our end.");
        }
        return data;
      });
    });
  }

  function setPaying(on) {
    state.paying = on;
    if (!payBtn) return;
    payBtn.disabled = on;
    payBtn.classList.toggle("is-busy", on);
  }

  function createOrder() {
    if (state.order && state.order.qty === state.qty) return Promise.resolve(state.order);
    return post("create_order", {
      product_id: CONFIG.productId,
      qty: state.qty,
      customer: state.customer
    }).then(function (data) {
      state.order = {
        simulate: data.simulate === true,
        orderRef: data.order_ref,
        razorpayOrderId: data.razorpay_order_id,
        amount: data.amount,          // paise, from the server
        currency: data.currency || "INR",
        keyId: data.key_id,
        qty: state.qty
      };
      return state.order;
    });
  }

  function openCheckout(order) {
    // No Razorpay keys configured yet: fake the payment so the rest of
    // the flow can be checked. Remove nothing — this switches itself off
    // as soon as the keys are set in Apps Script.
    if (order.simulate) {
      simulatePayment(order);
      return;
    }

    if (typeof window.Razorpay !== "function") {
      if (payFallback) payFallback.hidden = false;
      throw new Error("The payment window couldn't load.");
    }

    var rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amount,
      currency: order.currency,
      name: "Kaha Mind",
      description: CONFIG.productName + " \u00D7 " + state.qty,
      image: "art_0.png",
      prefill: {
        name: state.customer.name,
        email: state.customer.email,
        contact: "+91" + state.customer.phone
      },
      notes: { order_ref: order.orderRef },
      theme: { color: CONFIG.themeColor },
      modal: {
        ondismiss: function () {
          setPaying(false);
          showError(paymentError, "Payment window closed. Your order isn't placed yet \u2014 pay when you're ready.");
        }
      },
      handler: function (response) {
        verify(response, order);
      }
    });

    rzp.on("payment.failed", function (resp) {
      setPaying(false);
      var d = (resp && resp.error) || {};
      showError(paymentError, (d.description || "The payment didn't go through.") + " Nothing has been charged \u2014 you can try again.");
    });

    rzp.open();
  }

  function simulatePayment(order) {
    var proceed = window.confirm(
      "Simulation mode: no payment gateway is connected yet, so no money moves.\n\n" +
      "Continue to see the confirmation screen and write the order to the sheet?"
    );
    if (!proceed) {
      setPaying(false);
      showError(paymentError, "Simulated payment cancelled.");
      return;
    }
    verify({
      razorpay_order_id: "",
      razorpay_payment_id: "sim_" + Date.now(),
      razorpay_signature: ""
    }, order);
  }

  function verify(response, order) {
    showError(paymentError, null);
    post("verify_payment", {
      order_ref: order.orderRef,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    }).then(function (data) {
      setPaying(false);
      showDone(data);
    }).catch(function (err) {
      setPaying(false);
      // The money may well have left their account, so never say "failed" here.
      showDone({
        order_ref: order.orderRef,
        payment_id: response.razorpay_payment_id,
        warning: "We couldn't confirm the order automatically (" + err.message +
                 "). Your payment is safe \u2014 email hello@kahamind.com with the payment ID above and we'll sort it out."
      });
    });
  }

  if (payBtn) {
    payBtn.addEventListener("click", function () {
      if (state.paying) return;
      if (!state.customer) { goTo("delivery"); return; }
      showError(paymentError, null);
      setPaying(true);
      createOrder()
        .then(openCheckout)
        .catch(function (err) {
          setPaying(false);
          showError(paymentError, err.message);
        });
    });
  }

  /* -------------------------------------------------- confirmation */

  function showDone(data) {
    var name = state.customer ? state.customer.name.split(" ")[0] : "friend";
    if ($("doneName")) $("doneName").textContent = name;
    if ($("doneEmail") && state.customer) $("doneEmail").textContent = state.customer.email;

    var ref = data.order_ref || (state.order && state.order.orderRef);
    if (ref && $("doneOrderId")) {
      $("doneOrderId").textContent = ref;
      $("doneOrderLine").hidden = false;
    }

    if ($("doneSummaryLine")) {
      $("doneQty").textContent = CONFIG.productName + " \u00D7 " + state.qty;
      $("doneTotal").textContent = inr(total());
      $("doneSummaryLine").hidden = false;
    }

    var warn = $("doneWarning");
    if (data.simulate) {
      showError(warn, "Simulated order \u2014 no payment was taken. The row is in your sheet.");
      goTo("done");
      return;
    }
    if (data.warning) {
      showError(warn, data.warning);
    } else {
      showError(warn, null);
    }

    goTo("done");
  }

  /* ------------------------------------------------------------ go */
  setQty(1);
})();
