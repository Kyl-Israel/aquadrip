const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const body = document.body;
const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = [...document.querySelectorAll(".nav-links a[data-page]")];
const revealItems = [...document.querySelectorAll("[data-reveal]")];
const backToTop = document.querySelector(".back-to-top");
const quickOrderButton = document.querySelector(".floating-order");
const footer = document.querySelector(".site-footer");
const faqTriggers = [...document.querySelectorAll(".faq-trigger")];
const counters = [...document.querySelectorAll("[data-counter]")];
const orderForm = document.querySelector("#order-form");
const formFeedback = document.querySelector("#form-feedback");
const contactMessageForm = document.querySelector("#contact-message-form");
const contactMessageFeedback = document.querySelector("#contact-message-feedback");
const orderHeading = document.querySelector("#order-heading");
const orderTypeGate = document.querySelector("#order-type-gate");
const orderTypeButtons = [...document.querySelectorAll("[data-order-type]")];
const orderTypeInput = document.querySelector("#order-type");
const orderTypeSummary = document.querySelector("#order-type-summary");
const orderTypeSummaryLabel = document.querySelector("#order-type-summary-label");
const changeOrderTypeButton = document.querySelector("#change-order-type");
const recurringFields = document.querySelector("#recurring-fields");
const recurringFrequencySelect = document.querySelector('[name="recurringFrequency"]');
const recurringDayInputs = [...document.querySelectorAll('[name="recurringDays"]')];
const recurringNotesInput = document.querySelector('[name="recurringNotes"]');
const locationPinField = document.querySelector(".location-pin-field");
const locationPinToggle = document.querySelector("#location-pin-toggle");
const locationPinContent = document.querySelector("#location-pin-content");
const deliveryMapElement = document.querySelector("#delivery-map");
const deliveryLatInput = document.querySelector("#delivery-lat");
const deliveryLngInput = document.querySelector("#delivery-lng");
const deliveryPinStatus = document.querySelector("#location-pin-status");
const useCurrentLocationButton = document.querySelector("#use-current-location");
const pinOnMapButton = document.querySelector("#pin-on-map");
const clearLocationPinButton = document.querySelector("#clear-location-pin");
const currentPage = body?.dataset.page || "home";
const pageLoadedAt = Date.now();

const ORDER_COOLDOWN_KEY = "aquaDripOrderCooldown";
const CONTACT_COOLDOWN_KEY = "aquaDripContactCooldown";
const SUBMIT_COOLDOWN_MS = 2 * 60 * 1000;
const MINIMUM_FORM_TIME_MS = 3000;
const DEFAULT_DELIVERY_CENTER = [9.634809, 123.846403];
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let isMenuOpen = false;
let deliveryMap = null;
let deliveryMarker = null;
let hasUnsavedOrderChanges = false;

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // localStorage can be unavailable in private or restricted browsing modes.
    }
  },
};

const updateHeaderState = () => {
  const isScrolled = window.scrollY > 24;
  const footerTop = footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
  const footerIsVisible = footerTop < window.innerHeight - 80;
  header?.classList.toggle("scrolled", isScrolled);
  backToTop?.classList.toggle("is-visible", window.scrollY > 520);
  quickOrderButton?.classList.toggle("is-hidden", footerIsVisible);
};

const setActiveNavLink = () => {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === currentPage);
  });
};

const toggleMenu = (forceOpen) => {
  const nextState = typeof forceOpen === "boolean" ? forceOpen : !isMenuOpen;
  isMenuOpen = nextState;
  body.classList.toggle("nav-open", isMenuOpen);
  body.classList.toggle("is-locked", isMenuOpen);
  navToggle?.setAttribute("aria-expanded", String(isMenuOpen));
  navToggle?.setAttribute("aria-label", isMenuOpen ? "Close navigation menu" : "Open navigation menu");
};

const setFeedback = (element, message, isSuccess = false) => {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-success", isSuccess);
};

const getOrderTypeLabel = (orderType) => (orderType === "recurring" ? "Recurring Order" : "Normal Order");

const toggleRecurringFields = (shouldShow) => {
  if (!recurringFields) {
    return;
  }

  recurringFields.hidden = !shouldShow;
  recurringFrequencySelect?.toggleAttribute("required", shouldShow);

  [recurringFrequencySelect, recurringNotesInput, ...recurringDayInputs].forEach((field) => {
    if (field) {
      field.disabled = !shouldShow;
    }
  });
};

const chooseOrderType = (orderType) => {
  if (!orderTypeInput || !orderForm || !orderTypeGate) {
    return;
  }

  const normalizedType = orderType === "recurring" ? "recurring" : "normal";
  const orderTypeLabel = getOrderTypeLabel(normalizedType);

  orderTypeInput.value = normalizedType;
  orderTypeSummaryLabel.textContent = orderTypeLabel;
  orderTypeSummary.hidden = false;
  toggleRecurringFields(normalizedType === "recurring");

  orderTypeGate.hidden = true;
  orderForm.hidden = false;
  if (orderHeading) {
    orderHeading.hidden = false;
    orderHeading.classList.add("is-visible");
  }
  orderForm.classList.add("is-visible");
  setFeedback(formFeedback, "");
  hasUnsavedOrderChanges = true;

  orderForm.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start",
  });
};

const showOrderTypeGate = () => {
  if (!orderForm || !orderTypeGate) {
    return;
  }

  orderForm.hidden = true;
  orderTypeGate.hidden = false;
  if (orderHeading) {
    orderHeading.hidden = true;
  }
  orderTypeGate.classList.add("is-visible");
  if (orderTypeInput) {
    orderTypeInput.value = "";
  }
  if (orderTypeSummary) {
    orderTypeSummary.hidden = true;
  }
  toggleRecurringFields(false);
  clearDeliveryPin();
  setFeedback(formFeedback, "");
  hasUnsavedOrderChanges = false;

  orderTypeGate.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start",
  });
};

const getRemainingCooldown = (key) => {
  const lastSubmission = Number(storage.get(key) || 0);
  if (!Number.isFinite(lastSubmission) || lastSubmission <= 0) {
    return 0;
  }

  return Math.max(SUBMIT_COOLDOWN_MS - (Date.now() - lastSubmission), 0);
};

const blockIfTooFast = (feedbackElement) => {
  if (Date.now() - pageLoadedAt >= MINIMUM_FORM_TIME_MS) {
    return false;
  }

  setFeedback(feedbackElement, "Please wait a moment before sending another request.");
  return true;
};

const blockIfCoolingDown = (key, feedbackElement) => {
  const remaining = getRemainingCooldown(key);
  if (remaining <= 0) {
    return false;
  }

  setFeedback(feedbackElement, "Please wait a moment before sending another request.");
  return true;
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Unable to send your request right now.");
  }

  return result;
};

const isLikelyMobileOrTablet = () => {
  const userAgentData = navigator.userAgentData;
  if (userAgentData?.mobile) {
    return true;
  }

  const userAgent = navigator.userAgent || "";
  const hasMobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile|Tablet/i.test(userAgent);
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasTouchInput = navigator.maxTouchPoints > 1;
  const isTabletSizedOrSmaller = window.matchMedia("(max-width: 1180px)").matches;

  return hasMobileUserAgent || (hasCoarsePointer && hasTouchInput && isTabletSizedOrSmaller);
};

const loadStylesheet = (href) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", reject, { once: true });
    document.head.append(link);
  });

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.append(script);
  });

const loadLeafletAssets = async () => {
  if (window.L) {
    return;
  }

  await loadStylesheet(LEAFLET_CSS_URL);
  await loadScript(LEAFLET_JS_URL);
};

const getDeliveryMapLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

const setDeliveryPinStatus = (message, state = "") => {
  if (!deliveryPinStatus) {
    return;
  }

  deliveryPinStatus.innerHTML = message;
  deliveryPinStatus.classList.toggle("is-success", state === "success");
  deliveryPinStatus.classList.toggle("is-error", state === "error");
};

const updateDeliveryPin = (lat, lng, shouldZoom = true) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    setDeliveryPinStatus("Unable to read that location. Please try again.", "error");
    return;
  }

  const fixedLat = latitude.toFixed(6);
  const fixedLng = longitude.toFixed(6);
  const mapLink = getDeliveryMapLink(fixedLat, fixedLng);

  if (deliveryLatInput) {
    deliveryLatInput.value = fixedLat;
  }

  if (deliveryLngInput) {
    deliveryLngInput.value = fixedLng;
  }

  if (deliveryMap && window.L) {
    const nextLocation = [latitude, longitude];

    if (deliveryMarker) {
      deliveryMarker.setLatLng(nextLocation);
    } else {
      deliveryMarker = window.L.marker(nextLocation).addTo(deliveryMap);
    }

    if (shouldZoom) {
      deliveryMap.setView(nextLocation, Math.max(deliveryMap.getZoom(), 16));
    }
  }

  setDeliveryPinStatus(
    `Delivery pin added. <a href="${mapLink}" target="_blank" rel="noreferrer">Open in Google Maps</a>`,
    "success"
  );
  hasUnsavedOrderChanges = true;
};

const clearDeliveryPin = () => {
  if (deliveryLatInput) {
    deliveryLatInput.value = "";
  }

  if (deliveryLngInput) {
    deliveryLngInput.value = "";
  }

  if (deliveryMarker && deliveryMap) {
    deliveryMarker.removeFrom(deliveryMap);
  }

  deliveryMarker = null;
  setDeliveryPinStatus("No delivery pin added yet.");
};

const initDeliveryMap = () => {
  if (!deliveryMapElement || deliveryMap) {
    return;
  }

  if (!window.L) {
    setDeliveryPinStatus("Map could not load. You can still submit the order using the written address.", "error");
    return;
  }

  deliveryMap = window.L.map(deliveryMapElement, {
    center: DEFAULT_DELIVERY_CENTER,
    zoom: 14,
    scrollWheelZoom: false,
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(deliveryMap);

  deliveryMap.on("click", (event) => {
    updateDeliveryPin(event.latlng.lat, event.latlng.lng);
  });

  window.requestAnimationFrame(() => {
    deliveryMap.invalidateSize();
  });
};

const ensureDeliveryMapReady = async () => {
  if (!deliveryMapElement || deliveryMap) {
    window.requestAnimationFrame(() => deliveryMap?.invalidateSize());
    return;
  }

  try {
    await loadLeafletAssets();
    initDeliveryMap();
    if (deliveryLatInput?.value && deliveryLngInput?.value) {
      updateDeliveryPin(deliveryLatInput.value, deliveryLngInput.value, false);
    }
  } catch (error) {
    setDeliveryPinStatus("Map could not load. You can still submit the order using the written address.", "error");
  }
};

const setLocationPinOpen = async (shouldOpen) => {
  if (!locationPinField || !locationPinToggle || !locationPinContent) {
    return;
  }

  locationPinField.classList.toggle("is-open", shouldOpen);
  locationPinToggle.setAttribute("aria-expanded", String(shouldOpen));
  locationPinContent.setAttribute("aria-hidden", String(!shouldOpen));

  if (shouldOpen) {
    await ensureDeliveryMapReady();
    window.setTimeout(() => deliveryMap?.invalidateSize(), prefersReducedMotion.matches ? 0 : 260);
  }
};

const initDeliveryLocationFeature = () => {
  if (!locationPinField) {
    return;
  }

  if (!isLikelyMobileOrTablet()) {
    clearDeliveryPin();
    locationPinField.hidden = true;
    return;
  }

  locationPinField.hidden = false;
  setLocationPinOpen(false);
  setDeliveryPinStatus("No delivery pin added yet.");
};

const createRipple = (event) => {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const ripple = document.createElement("span");
  const size = Math.max(rect.width, rect.height) * 1.1;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  ripple.className = "button-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  button.append(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
};

setActiveNavLink();
updateHeaderState();
toggleRecurringFields(false);
initDeliveryLocationFeature();
window.addEventListener("scroll", updateHeaderState, { passive: true });

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedOrderChanges) {
    return;
  }

  event.preventDefault();
  event.returnValue = "Are you sure you want to reload? Your order details will be lost.";
});

navToggle?.addEventListener("click", () => {
  toggleMenu();
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (isMenuOpen) {
      toggleMenu(false);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isMenuOpen) {
    toggleMenu(false);
    navToggle?.focus();
  }
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    }
  );

  revealItems.forEach((item) => {
    if (item.dataset.reveal === "hero" || prefersReducedMotion.matches) {
      item.classList.add("is-visible");
      return;
    }

    revealObserver.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const animateCounter = (element) => {
  const target = Number(element.dataset.target || 0);
  const suffix = element.dataset.suffix || "";
  const duration = prefersReducedMotion.matches ? 0 : 1600;
  const start = performance.now();

  const update = (time) => {
    const progress = duration === 0 ? 1 : Math.min((time - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    element.textContent = `${value}${suffix}`;

    if (progress < 1) {
      window.requestAnimationFrame(update);
    }
  };

  window.requestAnimationFrame(update);
};

if ("IntersectionObserver" in window) {
  const counterObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        animateCounter(entry.target);
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.6,
    }
  );

  counters.forEach((counter) => {
    if (prefersReducedMotion.matches) {
      counter.textContent = `${counter.dataset.target || 0}${counter.dataset.suffix || ""}`;
      return;
    }

    counterObserver.observe(counter);
  });
} else {
  counters.forEach((counter) => {
    counter.textContent = `${counter.dataset.target || 0}${counter.dataset.suffix || ""}`;
  });
}

faqTriggers.forEach((trigger) => {
  const panel = trigger.nextElementSibling;
  if (panel) {
    panel.setAttribute("aria-hidden", String(trigger.getAttribute("aria-expanded") !== "true"));
  }

  trigger.addEventListener("click", () => {
    const isExpanded = trigger.getAttribute("aria-expanded") === "true";

    faqTriggers.forEach((item) => {
      const panel = item.nextElementSibling;
      const shouldExpand = item === trigger ? !isExpanded : false;

      item.setAttribute("aria-expanded", String(shouldExpand));
      if (panel) {
        panel.setAttribute("aria-hidden", String(!shouldExpand));
      }
    });
  });
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
});

quickOrderButton?.addEventListener("click", (event) => {
  const quickOrderTarget = quickOrderButton.getAttribute("href");
  if (!quickOrderTarget || !quickOrderTarget.startsWith("#")) {
    return;
  }

  const section = document.querySelector(quickOrderTarget);
  if (!section) {
    return;
  }

  event.preventDefault();
  section.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start",
  });
});

document.querySelectorAll(".ripple-target").forEach((button) => {
  button.addEventListener("pointerdown", createRipple);
});

orderTypeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chooseOrderType(button.dataset.orderType);
  });
});

changeOrderTypeButton?.addEventListener("click", () => {
  showOrderTypeGate();
});

orderForm?.addEventListener("input", () => {
  hasUnsavedOrderChanges = true;
});

orderForm?.addEventListener("change", () => {
  hasUnsavedOrderChanges = true;
});

locationPinToggle?.addEventListener("click", () => {
  const shouldOpen = locationPinToggle.getAttribute("aria-expanded") !== "true";
  setLocationPinOpen(shouldOpen);
});

useCurrentLocationButton?.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    setDeliveryPinStatus("Location access is not available on this device. Please pin the delivery location on the map.", "error");
    return;
  }

  await ensureDeliveryMapReady();
  const originalText = useCurrentLocationButton.textContent;
  useCurrentLocationButton.disabled = true;
  useCurrentLocationButton.textContent = "Finding Location...";
  setDeliveryPinStatus("Asking your browser for location permission...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      updateDeliveryPin(position.coords.latitude, position.coords.longitude);
      useCurrentLocationButton.disabled = false;
      useCurrentLocationButton.textContent = originalText;
    },
    () => {
      setDeliveryPinStatus("Unable to get your current location. You can still click the map to place a delivery pin.", "error");
      useCurrentLocationButton.disabled = false;
      useCurrentLocationButton.textContent = originalText;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
});

pinOnMapButton?.addEventListener("click", async () => {
  await ensureDeliveryMapReady();
  if (!deliveryMap) {
    setDeliveryPinStatus("Map is still unavailable. Please use the written address field for now.", "error");
    return;
  }

  deliveryMapElement?.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "center",
  });
  window.setTimeout(() => deliveryMap.invalidateSize(), prefersReducedMotion.matches ? 0 : 260);
  setDeliveryPinStatus("Click the map to place or move the delivery pin.");
});

clearLocationPinButton?.addEventListener("click", () => {
  clearDeliveryPin();
  hasUnsavedOrderChanges = true;
});

if (orderForm && formFeedback) {
  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (blockIfTooFast(formFeedback) || blockIfCoolingDown(ORDER_COOLDOWN_KEY, formFeedback)) {
      return;
    }

    const formData = new FormData(orderForm);
    const orderType = String(formData.get("orderType") || "").trim();
    const requiredFields = ["name", "contact", "address", "gallons", "fulfillment", "date", "time"];
    const missingField = requiredFields.some((field) => {
      const value = formData.get(field);
      return typeof value !== "string" || !value.trim();
    });

    if (!orderType) {
      showOrderTypeGate();
      setFeedback(formFeedback, "Please choose normal order or recurring order first.");
      return;
    }

    if (missingField || !orderForm.checkValidity()) {
      setFeedback(formFeedback, "Please complete the required fields before submitting your order.");
      orderForm.reportValidity();
      return;
    }

    const recurringFrequency = String(formData.get("recurringFrequency") || "").trim();
    const recurringDays = formData.getAll("recurringDays").map((day) => String(day).trim()).filter(Boolean);
    const recurringNotes = String(formData.get("recurringNotes") || "").trim();

    if (orderType === "recurring" && (!recurringFrequency || recurringDays.length === 0)) {
      setFeedback(formFeedback, "Please choose a recurring frequency and at least one preferred delivery day.");
      return;
    }

    const orderSummary = [
      `Order type: ${getOrderTypeLabel(orderType)}`,
      `Name: ${String(formData.get("name") || "").trim()}`,
      `Contact: ${String(formData.get("contact") || "").trim()}`,
      `Gallons: ${String(formData.get("gallons") || "").trim()}`,
      `Method: ${String(formData.get("fulfillment") || "").trim()}`,
      `Date: ${String(formData.get("date") || "").trim()}`,
      `Time: ${String(formData.get("time") || "").trim()}`,
    ].join("\n");
    const recurringSummary =
      orderType === "recurring"
        ? [
            "",
            `Frequency: ${recurringFrequency}`,
            `Delivery days: ${recurringDays.join(", ")}`,
          ].join("\n")
        : "";
    const deliveryLat = String(formData.get("deliveryLat") || "").trim();
    const deliveryLng = String(formData.get("deliveryLng") || "").trim();
    const deliveryPinSummary =
      deliveryLat && deliveryLng ? `\nDelivery pin: ${getDeliveryMapLink(deliveryLat, deliveryLng)}` : "";

    const confirmed = window.confirm(`Submit this order now?\n\n${orderSummary}${recurringSummary}${deliveryPinSummary}`);
    if (!confirmed) {
      setFeedback(formFeedback, "Order submission cancelled.");
      return;
    }

    const submitButton = orderForm.querySelector('button[type="submit"]');
    if (!submitButton) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setFeedback(formFeedback, "Sending your order request...");

    const payload = {
      orderType,
      name: String(formData.get("name") || "").trim(),
      contact: String(formData.get("contact") || "").trim(),
      address: String(formData.get("address") || "").trim(),
      gallons: String(formData.get("gallons") || "").trim(),
      fulfillment: String(formData.get("fulfillment") || "").trim(),
      date: String(formData.get("date") || "").trim(),
      time: String(formData.get("time") || "").trim(),
      recurringFrequency,
      recurringDays,
      recurringNotes,
      deliveryLat,
      deliveryLng,
      notes: String(formData.get("notes") || "").trim(),
      aquaConfirm: String(formData.get("aqua_confirm") || "").trim(),
    };

    try {
      const result = await postJson("/.netlify/functions/send-order-email", payload);
      orderForm.reset();
      hasUnsavedOrderChanges = false;
      if (orderTypeInput) {
        orderTypeInput.value = orderType;
      }
      if (orderTypeSummaryLabel) {
        orderTypeSummaryLabel.textContent = getOrderTypeLabel(orderType);
      }
      if (orderTypeSummary) {
        orderTypeSummary.hidden = false;
      }
      toggleRecurringFields(orderType === "recurring");
      clearDeliveryPin();
      storage.set(ORDER_COOLDOWN_KEY, String(Date.now()));
      setFeedback(
        formFeedback,
        result.message || "Thank you! Your order request has been sent. We will contact you shortly.",
        true
      );
    } catch (error) {
      setFeedback(formFeedback, error.message || "Something went wrong while sending the order request.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Order";
    }
  });
}

if (contactMessageForm && contactMessageFeedback) {
  contactMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (blockIfTooFast(contactMessageFeedback) || blockIfCoolingDown(CONTACT_COOLDOWN_KEY, contactMessageFeedback)) {
      return;
    }

    const formData = new FormData(contactMessageForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const contactNumber = String(formData.get("contactNumber") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const aquaConfirm = String(formData.get("aqua_confirm") || "").trim();

    if (!name || !email || !message || !contactMessageForm.checkValidity()) {
      setFeedback(contactMessageFeedback, "Please complete the required fields before sending your message.");
      contactMessageForm.reportValidity();
      return;
    }

    const submitButton = contactMessageForm.querySelector('button[type="submit"]');
    if (!submitButton) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setFeedback(contactMessageFeedback, "Sending your message...");

    try {
      const result = await postJson("/.netlify/functions/send-contact-email", {
        name,
        email,
        contactNumber,
        message,
        aquaConfirm,
      });

      contactMessageForm.reset();
      storage.set(CONTACT_COOLDOWN_KEY, String(Date.now()));
      setFeedback(
        contactMessageFeedback,
        result.message || "Thank you! Your message has been sent. We will get back to you shortly.",
        true
      );
    } catch (error) {
      setFeedback(contactMessageFeedback, error.message || "Something went wrong while sending your message.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send Message";
    }
  });
}
