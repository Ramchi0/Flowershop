import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import parse from 'html-react-parser';
import './styles.css';

const pageTemplates = import.meta.glob('./pages/*.html', {
  eager: true,
  import: 'default',
  query: '?raw',
});
const studioSettingsKey = 'dahlia-studio-settings';
const studioProductsKey = 'dahlia-studio-products';
const studioCollectionsKey = 'dahlia-studio-collections';
const studioOfferKey = 'dahlia-studio-offer';
const storefrontPreviewKey = 'dahlia-public-storefront-preview';
const customerProfileKey = 'dahlia-customer-profile';
const adminProfileKey = 'dahlia-admin-profile';
const defaultStudioSettings = {
  storeName: 'Dahlia & Stem',
  supportEmail: 'hello@dahliaandstem.demo',
  freeDeliveryThreshold: 2500,
  orderNotifications: true,
};
const defaultCustomerProfile = {
  fullName: 'Tanvi Shah',
  email: 'tanvi@example.com',
  phone: '',
  address: '',
  city: '',
  postalCode: '',
  orderUpdates: true,
};
const defaultAdminProfile = {
  fullName: 'Riya Mehta',
  email: 'studio@dahliaandstem.com',
  role: 'Studio owner',
};

function readAdminProfile() {
  const storedProfile = window.localStorage.getItem(adminProfileKey);
  if (!storedProfile) return { ...defaultAdminProfile };

  const profile = JSON.parse(storedProfile);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('The saved admin profile is not in a valid format.');
  }

  return Object.fromEntries(
    Object.entries(defaultAdminProfile).map(([key, fallback]) => [
      key,
      typeof profile[key] === 'string' ? profile[key] : fallback,
    ]),
  );
}

function readStoredArray(key, label) {
  const storedValue = window.localStorage.getItem(key);
  if (!storedValue) return [];

  const value = JSON.parse(storedValue);
  if (!Array.isArray(value)) {
    throw new Error(`Saved ${label} are not in a valid format.`);
  }

  return value;
}

function readStudioSettings() {
  const storedSettings = window.localStorage.getItem(studioSettingsKey);
  if (!storedSettings) return { ...defaultStudioSettings };

  const settings = JSON.parse(storedSettings);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Saved store settings are not in a valid format.');
  }

  return {
    ...defaultStudioSettings,
    ...settings,
    freeDeliveryThreshold:
      typeof settings.freeDeliveryThreshold === 'number' &&
      Number.isFinite(settings.freeDeliveryThreshold)
        ? settings.freeDeliveryThreshold
        : defaultStudioSettings.freeDeliveryThreshold,
  };
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function getProductImage(collection, index) {
  const images = {
    'Everlasting bouquets': '/images/product-peony-bouquet.png',
    Arrangements: '/images/product-peony-bouquet.png',
    'Faux plants': '/images/product-faux-olive.png',
    'Plants & greenery': '/images/product-faux-olive.png',
    'Custom florals': '/images/atelier-hero.png',
  };
  return images[collection] ?? (index % 2 === 0
    ? '/images/product-peony-bouquet.png'
    : '/images/product-faux-olive.png');
}

async function readImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a valid image file.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();

    const maxDimension = 1200;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process the selected image.');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readStudioOffer() {
  const storedOffer = window.localStorage.getItem(studioOfferKey);
  if (!storedOffer) return null;

  const offer = JSON.parse(storedOffer);
  if (
    !offer ||
    typeof offer !== 'object' ||
    typeof offer.title !== 'string' ||
    typeof offer.description !== 'string' ||
    typeof offer.type !== 'string' ||
    typeof offer.discountType !== 'string' ||
    typeof offer.discountValue !== 'number' ||
    typeof offer.startsAt !== 'string' ||
    typeof offer.endsAt !== 'string'
  ) {
    throw new Error('The saved offer is not in a valid format.');
  }

  return offer;
}

function isOfferActive(offer, now = Date.now()) {
  return offer && Date.parse(offer.startsAt) <= now && Date.parse(offer.endsAt) > now;
}

function renderCustomerOffer(root, offer) {
  const existingSection = root.querySelector('[data-customer-offer]');
  const hero = root.querySelector('main .hero, main .page-hero');
  if (!hero || !isOfferActive(offer)) {
    existingSection?.remove();
    return;
  }

  const offerKey = JSON.stringify([offer.title, offer.startsAt, offer.endsAt]);
  if (existingSection?.dataset.offerKey === offerKey) {
    updateOfferCountdown(existingSection, offer);
    return;
  }
  existingSection?.remove();

  const section = makeElement('section', 'customer-offer');
  section.dataset.customerOffer = 'true';
  section.dataset.offerKey = offerKey;
  const image = makeElement('div', 'customer-offer-image');
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', offer.title);
  image.style.backgroundImage = `url("${offer.image || '/images/atelier-hero.png'}")`;

  const details = makeElement('div', 'customer-offer-details');
  details.append(
    makeElement('span', 'eyebrow', offer.type),
    makeElement('h2', 'display', offer.title),
    makeElement('p', 'customer-offer-description', offer.description),
    makeElement(
      'strong',
      'customer-offer-discount',
      `${offer.discountType === 'percent' ? `${offer.discountValue}%` : `₹${offer.discountValue.toLocaleString('en-IN')}`} off`,
    ),
  );
  const countdown = makeElement('div', 'customer-offer-countdown');
  countdown.setAttribute('aria-live', 'off');
  ['Days', 'Hours', 'Minutes', 'Seconds'].forEach((label) => {
    const unit = makeElement('div', 'customer-offer-countdown-unit');
    unit.append(makeElement('strong', '', '00'));
    unit.append(makeElement('span', '', label));
    countdown.append(unit);
  });
  details.append(countdown);
  section.append(image, details);
  hero.insertAdjacentElement('afterend', section);
  updateOfferCountdown(section, offer);
}

function updateOfferCountdown(section, offer) {
  const remaining = Math.max(0, Date.parse(offer.endsAt) - Date.now());
  const values = [
    Math.floor(remaining / 86400000),
    Math.floor((remaining % 86400000) / 3600000),
    Math.floor((remaining % 3600000) / 60000),
    Math.floor((remaining % 60000) / 1000),
  ];
  section.querySelectorAll('.customer-offer-countdown-unit strong').forEach((element, index) => {
    element.textContent = String(values[index]).padStart(2, '0');
  });
}

function renderAdminOffer(root, offer) {
  const preview = root.querySelector('[data-admin-offer]');
  if (!preview) return;

  preview.replaceChildren();
  if (!offer) {
    preview.append(makeElement('p', 'admin-offer-empty', 'No offer is set up yet.'));
    return;
  }

  const summary = makeElement('div', 'admin-offer-summary');
  summary.append(
    makeElement('strong', '', offer.title),
    makeElement(
      'span',
      '',
      `${offer.type} · ${offer.discountType === 'percent' ? `${offer.discountValue}%` : `₹${offer.discountValue.toLocaleString('en-IN')}`} off`,
    ),
    makeElement(
      'small',
      '',
      `Starts ${new Date(offer.startsAt).toLocaleString()} · Ends ${new Date(offer.endsAt).toLocaleString()}`,
    ),
  );
  const status = isOfferActive(offer)
    ? 'Live on customer pages'
    : Date.parse(offer.startsAt) > Date.now()
      ? 'Scheduled'
      : 'Expired';
  summary.append(makeElement('span', 'pill', status));
  const remove = makeElement('button', 'btn btn-outline btn-small', 'Remove offer');
  remove.type = 'button';
  remove.dataset.offerRemove = 'true';
  preview.append(summary, remove);
}

function renderStorefrontProducts(root, products) {
  const productGrid =
    root.querySelector('#collection .product-grid') ??
    root.querySelector('.shop-layout .product-grid');
  if (!productGrid) return;

  productGrid.querySelectorAll('[data-admin-created-product]').forEach((product) => {
    product.remove();
  });

  products.forEach((product, index) => {
    if (
      typeof product?.name !== 'string' ||
      typeof product?.collection !== 'string' ||
      typeof product?.price !== 'number' ||
      !Number.isFinite(product.price)
    ) {
      throw new Error('A saved product is missing required product details.');
    }

    const card = makeElement('article', 'product-card');
    card.dataset.adminCreatedProduct = 'true';
    if (product.stock === 0) {
      card.append(makeElement('span', 'product-tag', 'Sold out'));
    } else {
      card.append(makeElement('span', 'product-tag', 'New'));
    }

    const favourite = makeElement('button', 'favourite', '♡');
    favourite.type = 'button';
    favourite.setAttribute('aria-label', `Save ${product.name} to your wishlist`);
    favourite.dataset.demoMessage = 'Saved to your wishlist';
    card.append(favourite);

    const image = makeElement('a', 'product-image');
    image.href = '/product-single';
    image.setAttribute('aria-label', `View ${product.name}`);
    image.style.backgroundImage = `url("${product.image || getProductImage(product.collection, index)}")`;
    card.append(image);

    const info = makeElement('div', 'product-info');
    info.append(makeElement('span', 'product-type', product.collection));
    info.append(makeElement('h3', 'product-name', product.name));
    info.append(
      makeElement('span', 'product-price', `₹${product.price.toLocaleString('en-IN')}`),
    );
    if (product.description) {
      info.append(makeElement('p', 'product-description', product.description));
    }
    card.append(info);
    productGrid.append(card);
  });
}

function renderStorefrontCollections(root, collections) {
  const grid = root.querySelector('.categories');
  if (!grid) return;

  grid.querySelectorAll('[data-admin-created-collection]').forEach((item) => {
    item.remove();
  });

  collections.forEach((collection, index) => {
    if (typeof collection?.name !== 'string') {
      throw new Error('A saved collection is missing its name.');
    }

    const card = makeElement('a', 'category-card');
    card.dataset.adminCreatedCollection = 'true';
    card.href = '/shop';
    card.style.backgroundImage = `linear-gradient(0deg, rgba(16,37,27,.66), transparent 64%), url("${collection.image || getProductImage(collection.name, index)}")`;

    const content = makeElement('div');
    const label = makeElement('div');
    label.append(makeElement('span', 'eyebrow', 'New collection'));
    label.append(makeElement('h3', '', collection.name));
    if (collection.description) {
      label.append(makeElement('p', 'category-description', collection.description));
    }
    content.append(label, makeElement('span', 'category-link', '→'));
    card.append(content);
    grid.append(card);
  });
}

function renderAdminProducts(root, products) {
  const tableBody = root.querySelector('#products tbody');
  if (!tableBody) return;

  tableBody.querySelectorAll('[data-admin-created-product]').forEach((row) => row.remove());
  products.forEach((product, index) => {
    if (
      typeof product?.name !== 'string' ||
      typeof product?.collection !== 'string' ||
      typeof product?.price !== 'number' ||
      !Number.isFinite(product.price)
    ) {
      throw new Error('A saved product is missing required product details.');
    }

    const row = makeElement('tr');
    row.dataset.adminCreatedProduct = 'true';
    const productCell = makeElement('td');
    const productContent = makeElement('div', 'product-cell');
    const image = makeElement('img');
    image.src = product.image || getProductImage(product.collection, index);
    image.alt = product.image ? product.name : '';
    productContent.append(image, makeElement('strong', '', product.name));
    productCell.append(productContent);
    row.append(productCell);
    row.append(makeElement('td', '', product.collection));

    const stockCell = makeElement('td');
    stockCell.append(
      makeElement(
        'span',
        product.stock > 0 ? 'stock' : 'stock low',
        `${product.stock} in stock`,
      ),
    );
    row.append(stockCell);
    row.append(makeElement('td', '', `₹${product.price.toLocaleString('en-IN')}`));
    const statusCell = makeElement('td');
    statusCell.append(makeElement('span', 'pill', 'Live'));
    row.append(statusCell);
    row.append(makeElement('td'));
    tableBody.append(row);
  });
}

function renderAdminCollections(root, collections) {
  const list = root.querySelector('#categories .cat-list');
  if (!list) return;

  list.querySelectorAll('[data-admin-created-collection]').forEach((item) => {
    item.remove();
  });
  const addButton = list.querySelector('[data-modal-open="addCategory"]');

  collections.forEach((collection) => {
    if (typeof collection?.name !== 'string') {
      throw new Error('A saved collection is missing its name.');
    }

    const tile = makeElement('article', 'category-tile');
    tile.dataset.adminCreatedCollection = 'true';
    if (collection.image) {
      const image = makeElement('img');
      image.src = collection.image;
      image.alt = '';
      image.width = 36;
      image.height = 36;
      image.style.cssText = 'width:36px;height:36px;object-fit:cover;border-radius:8px';
      tile.append(image);
    }
    tile.append(makeElement('strong', '', collection.name), makeElement('span', '', 'New collection'));
    if (addButton) list.insertBefore(tile, addButton);
    else list.append(tile);
  });

  const productCollection = root.querySelector('#addProduct select[name="collection"]');
  if (productCollection) {
    const existingOptions = new Set(
      [...productCollection.options].map((option) => option.value.toLocaleLowerCase()),
    );
    collections.forEach((collection) => {
      if (!existingOptions.has(collection.name.toLocaleLowerCase())) {
        const option = document.createElement('option');
        option.value = collection.name;
        option.textContent = collection.name;
        productCollection.append(option);
      }
    });
  }
}

function preparePublicStorefront(root, settings) {
  document.title = document.title.replace('Dahlia & Stem', settings.storeName);

  root.querySelectorAll('.brand').forEach((brand) => {
    [...brand.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => {
        node.textContent = ` ${settings.storeName}`;
      });
  });

  const deliveryNote = root.querySelector('.notice .shell span:first-child');
  if (deliveryNote) {
    deliveryNote.textContent = `Complimentary delivery on curated orders over ₹${settings.freeDeliveryThreshold.toLocaleString('en-IN')}`;
  }

  const studioLink = root.querySelector('.hero-actions a[href="#custom"]');
  if (studioLink) studioLink.href = '/contact';
  root
    .querySelectorAll('main a[href="/customer-dashboard"]')
    .forEach((link) => {
    link.href = '/contact';
    link.textContent = link.textContent.replace(
      /Start a custom request/i,
      'Talk to our studio',
    );
  });

  root.querySelectorAll('.nav-links a').forEach((link) => {
    if (/my studio|my account/i.test(link.textContent)) link.remove();
  });
  root.querySelectorAll('.nav-actions a[href="/customer-dashboard"]').forEach((link) => {
    link.remove();
  });
  root.querySelectorAll('.cart-badge, .hero-details').forEach((element) => {
    element.remove();
  });
  root
    .querySelectorAll(
      'a[href="/customer-login"], a[href="/admin-login"], a[href="/admin-dashboard"], a[href="/profile"]',
    )
    .forEach((link) => {
      link.closest('li')?.remove();
      if (link.isConnected) link.remove();
    });

  root.querySelectorAll('.site-footer .footer-grid > div').forEach((column) => {
    const title = column.querySelector('.footer-title')?.textContent.trim();
    if (title === 'For the studio') {
      column.remove();
      return;
    }

    if (title === 'Customer care') {
      column.querySelectorAll('a[href="/customer-login"], a[href="/customer-dashboard"]').forEach((link) => {
        link.closest('li')?.remove();
      });
    }
  });
  root.querySelectorAll('.site-footer .brand').forEach((brand) => {
    [...brand.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .forEach((node) => {
        node.textContent = ` ${settings.storeName}`;
      });
  });
  const supportEmail = [...root.querySelectorAll('.site-footer .footer-list li')].find(
    (item) => item.textContent.includes('@'),
  );
  if (supportEmail) supportEmail.textContent = settings.supportEmail;

  root.querySelectorAll('.nav-links a').forEach((link) => {
    if (link.getAttribute('href') === '/admin-login') link.remove();
  });
  root.querySelectorAll('.site-footer a[href="/admin-login"]').forEach((link) => {
    link.closest('li')?.remove();
  });
}

function addPreviewToolbar(root) {
  if (root.querySelector('.preview-toolbar')) return;

  const toolbar = makeElement('div', 'preview-toolbar');
  toolbar.setAttribute('role', 'status');
  toolbar.append(makeElement('span', 'preview-toolbar-label', 'Customer storefront preview'));

  const returnLink = makeElement('a', 'preview-toolbar-back', '← Back to admin');
  returnLink.href = '/admin-dashboard';
  toolbar.append(returnLink);
  root.prepend(toolbar);
}

function readCustomerProfile() {
  const savedProfile = window.localStorage.getItem(customerProfileKey);
  if (!savedProfile) return { ...defaultCustomerProfile };

  const profile = JSON.parse(savedProfile);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('The saved customer profile is not in a valid format.');
  }

  return Object.fromEntries(
    Object.entries(defaultCustomerProfile).map(([key, fallback]) => [
      key,
      typeof profile[key] === typeof fallback ? profile[key] : fallback,
    ]),
  );
}

function updateCustomerDisplay(root, profile) {
  root.querySelectorAll('[data-customer-name]').forEach((element) => {
    element.textContent = profile.fullName;
  });
  root.querySelectorAll('[data-customer-first-name]').forEach((element) => {
    element.textContent = profile.fullName.trim().split(/\s+/)[0] || 'Tanvi';
  });

  const initials =
    profile.fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase())
      .join('') || 'TS';
  root.querySelectorAll('[data-customer-initials]').forEach((element) => {
    element.textContent = initials;
  });
}

function normalizePagePath(path) {
  const pageName = path.split('/').filter(Boolean).pop() ?? '';
  return pageName === 'index' ? '/' : `/${pageName}`;
}

function updateAdminDisplay(root, profile) {
  root.querySelectorAll('[data-admin-name]').forEach((element) => {
    element.textContent = profile.fullName;
  });
  root.querySelectorAll('[data-admin-role]').forEach((element) => {
    element.textContent = profile.role;
  });

  const initials =
    profile.fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase())
      .join('') || 'RM';
  root.querySelectorAll('[data-admin-initials]').forEach((element) => {
    element.textContent = initials;
  });
}

function getCurrentPage() {
  const currentUrl = new URL(window.location.href);
  const legacyHtmlRoute = currentUrl.pathname.endsWith('.html');

  if (legacyHtmlRoute) {
    currentUrl.pathname = normalizePagePath(
      currentUrl.pathname.slice(0, -'.html'.length),
    );
    window.history.replaceState(null, '', currentUrl);
  }

  let pageName = currentUrl.pathname.split('/').filter(Boolean).pop() ?? 'index';
  let isPublicStorefront = pageName === 'storefront';
  if (pageName === 'admin-dashboard' || pageName === 'admin-login') {
    window.sessionStorage.removeItem(storefrontPreviewKey);
  } else if (isPublicStorefront) {
    window.sessionStorage.setItem(storefrontPreviewKey, 'true');
  } else {
    isPublicStorefront =
      window.sessionStorage.getItem(storefrontPreviewKey) === 'true';
  }
  if (
    isPublicStorefront &&
    [
      'admin-dashboard',
      'admin-profile',
      'admin-login',
      'customer-dashboard',
      'customer-login',
      'login',
      'profile',
    ].includes(pageName)
  ) {
    pageName = 'storefront';
    currentUrl.pathname = '/storefront';
    window.history.replaceState(null, '', currentUrl);
  }
  const pageKey =
    pageName === 'index' || pageName === 'storefront' ? 'index' : pageName;
  const template =
    pageTemplates[`./pages/${pageKey || 'index'}.html`] ??
    pageTemplates['./pages/index.html'];

  const parsedPage = new DOMParser().parseFromString(template, 'text/html');
  parsedPage.body.querySelectorAll('script, .toast').forEach((element) => element.remove());
  parsedPage.body.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    const match = href?.match(/^(?:\.\/)?([a-z0-9-]+)\.html([#?].*)?$/i);

    if (match) {
      link.setAttribute(
        'href',
        `${match[1] === 'index' ? '' : `/${match[1]}`}${match[2] ?? ''}` || '/',
      );
    }
  });
  parsedPage.body.querySelectorAll('form[data-redirect]').forEach((form) => {
    const redirect = form.getAttribute('data-redirect');
    const match = redirect?.match(/^(?:\.\/)?([a-z0-9-]+)\.html([#?].*)?$/i);

    if (match) {
      form.setAttribute(
        'data-redirect',
        `${match[1] === 'index' ? '' : `/${match[1]}`}${match[2] ?? ''}` || '/',
      );
    }
  });
  if (!parsedPage.body.className) {
    parsedPage.body
      .querySelectorAll('.nav-links a[href="/customer-login"]')
      .forEach((link) => {
        link.href = '/customer-dashboard';
        link.textContent = 'My account';
      });
    const navLinks = parsedPage.body.querySelector('.site-nav .nav-links');
    if (navLinks && !navLinks.querySelector('a[href="/customer-dashboard"]')) {
      const accountLink = document.createElement('a');
      accountLink.href = '/customer-dashboard';
      accountLink.textContent = 'My account';
      navLinks.append(accountLink);
    }
    parsedPage.body
      .querySelectorAll('.nav-actions a[href="/customer-dashboard"]')
      .forEach((link) => {
        link.classList.add('customer-account-action');
        link.setAttribute('aria-label', 'My account');
        link.setAttribute('title', 'My account');
      });
    const navActions = parsedPage.body.querySelector('.site-nav .nav-actions');
    if (navActions && !navActions.querySelector('.customer-account-action')) {
      const accountLink = document.createElement('a');
      accountLink.className = 'icon-button customer-account-action';
      accountLink.href = '/customer-dashboard';
      accountLink.textContent = '♙';
      accountLink.setAttribute('aria-label', 'My account');
      accountLink.setAttribute('title', 'My account');
      const cartLink = navActions.querySelector('a[href="/cart"]');
      navActions.insertBefore(accountLink, cartLink ?? navActions.firstChild);
    }
    parsedPage.body
      .querySelectorAll('.site-footer a[href="/customer-login"]')
      .forEach((link) => {
        link.href = '/customer-dashboard';
        link.textContent = 'My account';
      });
    parsedPage.body
      .querySelectorAll('.site-footer a[href="/admin-login"]')
      .forEach((link) => link.closest('li')?.remove());
  }

  return {
    bodyClass: parsedPage.body.className,
    isPublicStorefront,
    markup: parsedPage.body.innerHTML,
    title: parsedPage.title,
  };
}

function App() {
  const page = useMemo(getCurrentPage, []);
  const contentRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState('');

  const showToast = useCallback((message) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  useEffect(() => {
    document.body.className = '';
    document.title = page.title;

    const content = contentRef.current;
    if (!content) return undefined;
    content.className = page.bodyClass || 'app-shell';
    let currentOffer = null;

    if (!page.isPublicStorefront) {
      try {
        const profile = readCustomerProfile();
        updateCustomerDisplay(content, profile);
        const profileForm = content.querySelector('[data-customer-profile-form]');
        if (profileForm instanceof HTMLFormElement) {
          Object.entries(profile).forEach(([key, value]) => {
            const field = profileForm.elements.namedItem(key);
            if (field instanceof HTMLInputElement && field.type === 'checkbox') {
              field.checked = value;
            } else if (field instanceof HTMLInputElement) {
              field.value = value;
            }
          });
        }
      } catch (error) {
        showToast(
          `Could not load your profile. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    }

    if (
      page.bodyClass === 'dash' &&
      (page.title.startsWith('Studio Dashboard') || page.title.startsWith('Admin Profile'))
    ) {
      try {
        const profile = readAdminProfile();
        updateAdminDisplay(content, profile);
        const profileForm = content.querySelector('[data-admin-profile-form]');
        if (profileForm instanceof HTMLFormElement) {
          Object.entries(profile).forEach(([key, value]) => {
            const field = profileForm.elements.namedItem(key);
            if (field instanceof HTMLInputElement) field.value = value;
          });
        }
      } catch (error) {
        showToast(
          `Could not load the admin profile. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    }

    if (page.isPublicStorefront) {
      try {
        preparePublicStorefront(content, readStudioSettings());
        renderStorefrontProducts(content, readStoredArray(studioProductsKey, 'products'));
        renderStorefrontCollections(
          content,
          readStoredArray(studioCollectionsKey, 'collections'),
        );
        addPreviewToolbar(content);
      } catch (error) {
        showToast(
          `Could not load storefront updates. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    } else if (page.bodyClass === 'dash' && page.title.startsWith('Studio Dashboard')) {
      try {
        renderAdminProducts(content, readStoredArray(studioProductsKey, 'products'));
        renderAdminCollections(
          content,
          readStoredArray(studioCollectionsKey, 'collections'),
        );
        currentOffer = readStudioOffer();
        renderAdminOffer(content, currentOffer);
      } catch (error) {
        showToast(
          `Could not load studio updates. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    }

    if (content.querySelector('main .hero, main .page-hero')) {
      try {
        currentOffer = readStudioOffer();
        renderCustomerOffer(content, currentOffer);
      } catch (error) {
        showToast(
          `Could not load the customer offer. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    }

    const handleClick = (event) => {
      if (!(event.target instanceof Element)) return;

      const logoutTrigger = event.target.closest('[data-admin-logout]');
      if (logoutTrigger) {
        event.preventDefault();
        window.sessionStorage.removeItem(storefrontPreviewKey);
        window.location.assign('/admin-login');
        return;
      }

      const customerLogoutTrigger = event.target.closest('[data-customer-logout]');
      if (customerLogoutTrigger) {
        window.location.assign('/customer-login');
        return;
      }

      if (event.target.closest('[data-offer-remove]')) {
        try {
          window.localStorage.removeItem(studioOfferKey);
          renderAdminOffer(content, null);
          showToast('Customer offer removed.');
        } catch (error) {
          showToast(
            `Could not remove the offer. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      const messageTrigger = event.target.closest('[data-demo-message]');
      if (messageTrigger) {
        event.preventDefault();
        showToast(messageTrigger.dataset.demoMessage);
        return;
      }

      const tab = event.target.closest('[data-tab]');
      if (tab) {
        content.querySelectorAll('[data-tab]').forEach((item) => {
          item.classList.toggle('active', item === tab);
        });
        showToast(`${tab.textContent.trim()} collection selected`);
        return;
      }

      const modalTrigger = event.target.closest('[data-modal-open]');
      if (modalTrigger) {
        if (modalTrigger.dataset.modalOpen === 'studioSettings') {
          const form = content.querySelector('[data-settings-form]');

          try {
            const savedSettings = window.localStorage.getItem(studioSettingsKey);
            if (savedSettings && form instanceof HTMLFormElement) {
              const settings = JSON.parse(savedSettings);
              if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
                throw new Error('The saved settings are not in a valid format.');
              }

              form.elements.namedItem('storeName').value =
                typeof settings.storeName === 'string'
                  ? settings.storeName
                  : 'Dahlia & Stem';
              form.elements.namedItem('supportEmail').value =
                typeof settings.supportEmail === 'string'
                  ? settings.supportEmail
                  : 'hello@dahliaandstem.demo';
              form.elements.namedItem('freeDeliveryThreshold').value =
                typeof settings.freeDeliveryThreshold === 'number'
                  ? String(settings.freeDeliveryThreshold)
                  : '2500';
              form.elements.namedItem('orderNotifications').checked =
                settings.orderNotifications !== false;
            }
          } catch (error) {
            showToast(
              `Could not load studio settings. ${
                error instanceof Error ? error.message : 'Please try again.'
              }`,
            );
            return;
          }
        }

        document
          .getElementById(modalTrigger.dataset.modalOpen)
          ?.classList.add('show');
        return;
      }

      const closeTrigger = event.target.closest('[data-modal-close]');
      if (closeTrigger) {
        closeTrigger.closest('.modal')?.classList.remove('show');
        return;
      }

      if (event.target.matches('.modal')) {
        event.target.classList.remove('show');
      }
    };

    const handleSubmit = async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches('[data-demo-form]')) {
        return;
      }

      event.preventDefault();
      if (form.matches('[data-settings-form]')) {
        try {
          const formData = new FormData(form);
          const settings = {
            storeName: String(formData.get('storeName') ?? '').trim(),
            supportEmail: String(formData.get('supportEmail') ?? '').trim(),
            freeDeliveryThreshold: Number(formData.get('freeDeliveryThreshold')),
            orderNotifications: formData.has('orderNotifications'),
          };

          window.localStorage.setItem(studioSettingsKey, JSON.stringify(settings));
          form.closest('.modal')?.classList.remove('show');
          showToast('Studio settings saved on this device.');
        } catch (error) {
          showToast(
            `Could not save studio settings. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      if (form.matches('[data-offer-form]')) {
        try {
          const data = new FormData(form);
          const discountType = String(data.get('discountType') ?? '');
          const discountValue = Number(data.get('discountValue'));
          const startsAt = String(data.get('startsAt') ?? '');
          const endsAt = String(data.get('endsAt') ?? '');
          const startTime = Date.parse(startsAt);
          const endTime = Date.parse(endsAt);
          const imageFile = data.get('image');
          if (
            !Number.isFinite(discountValue) ||
            discountValue <= 0 ||
            (discountType === 'percent' && discountValue > 100) ||
            !Number.isFinite(startTime) ||
            !Number.isFinite(endTime) ||
            endTime <= startTime
          ) {
            throw new Error('Enter a valid discount and an end time after the start time.');
          }

          const offer = {
            title: String(data.get('title') ?? '').trim(),
            type: String(data.get('type') ?? '').trim(),
            discountType,
            discountValue,
            description: String(data.get('description') ?? '').trim(),
            startsAt: new Date(startTime).toISOString(),
            endsAt: new Date(endTime).toISOString(),
            image:
              imageFile instanceof File && imageFile.size > 0
                ? await readImageFile(imageFile)
                : '',
          };
          if (!offer.title || !offer.type || !offer.description) {
            throw new Error('Enter an offer title, type, and details.');
          }

          window.localStorage.setItem(studioOfferKey, JSON.stringify(offer));
          currentOffer = offer;
          renderAdminOffer(content, offer);
          renderCustomerOffer(content, offer);
          form.reset();
          form.closest('.modal')?.classList.remove('show');
          showToast('Offer published to the customer home and shop pages.');
        } catch (error) {
          showToast(
            `Could not publish offer. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      if (form.matches('[data-customer-profile-form]')) {
        try {
          const formData = new FormData(form);
          const profile = {
            fullName: String(formData.get('fullName') ?? '').trim(),
            email: String(formData.get('email') ?? '').trim(),
            phone: String(formData.get('phone') ?? '').trim(),
            address: String(formData.get('address') ?? '').trim(),
            city: String(formData.get('city') ?? '').trim(),
            postalCode: String(formData.get('postalCode') ?? '').trim(),
            orderUpdates: formData.has('orderUpdates'),
          };

          window.localStorage.setItem(customerProfileKey, JSON.stringify(profile));
          updateCustomerDisplay(content, profile);
          showToast('Your profile has been saved on this device.');
        } catch (error) {
          showToast(
            `Could not save your profile. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      if (form.matches('[data-admin-profile-form]')) {
        try {
          const formData = new FormData(form);
          const profile = {
            fullName: String(formData.get('fullName') ?? '').trim(),
            email: String(formData.get('email') ?? '').trim(),
            role: String(formData.get('role') ?? '').trim(),
          };
          if (!profile.fullName || !profile.email || !profile.role) {
            throw new Error('Enter your name, work email, and role.');
          }

          window.localStorage.setItem(adminProfileKey, JSON.stringify(profile));
          updateAdminDisplay(content, profile);
          showToast('Your admin profile has been saved on this device.');
        } catch (error) {
          showToast(
            `Could not save the admin profile. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      if (form.matches('[data-product-form]')) {
        try {
          const data = new FormData(form);
          const product = {
            name: String(data.get('name') ?? '').trim(),
            collection: String(data.get('collection') ?? '').trim(),
            price: Number(data.get('price')),
            stock: Number(data.get('stock')),
            description: String(data.get('description') ?? '').trim(),
            image: data.get('image') instanceof File && data.get('image').size > 0
              ? await readImageFile(data.get('image'))
              : '',
          };
          if (
            !product.name ||
            !product.collection ||
            !Number.isFinite(product.price) ||
            product.price < 0 ||
            !Number.isInteger(product.stock) ||
            product.stock < 0
          ) {
            throw new Error('Enter a product name, collection, valid price, and stock amount.');
          }

          const products = readStoredArray(studioProductsKey, 'products');
          products.push(product);
          window.localStorage.setItem(studioProductsKey, JSON.stringify(products));
          renderAdminProducts(content, products);
          form.reset();
          form.closest('.modal')?.classList.remove('show');
          showToast('Product published to the customer storefront preview.');
        } catch (error) {
          showToast(
            `Could not publish product. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      if (form.matches('[data-category-form]')) {
        try {
          const data = new FormData(form);
          const collection = {
            name: String(data.get('name') ?? '').trim(),
            description: String(data.get('description') ?? '').trim(),
            image: data.get('image') instanceof File && data.get('image').size > 0
              ? await readImageFile(data.get('image'))
              : '',
          };
          if (!collection.name) {
            throw new Error('Enter a collection name.');
          }

          const collections = readStoredArray(studioCollectionsKey, 'collections');
          if (
            collections.some(
              (existing) =>
                typeof existing?.name === 'string' &&
                existing.name.toLocaleLowerCase() === collection.name.toLocaleLowerCase(),
            )
          ) {
            throw new Error('A collection with this name already exists.');
          }

          collections.push(collection);
          window.localStorage.setItem(studioCollectionsKey, JSON.stringify(collections));
          renderAdminCollections(content, collections);
          form.reset();
          form.closest('.modal')?.classList.remove('show');
          showToast('Collection added to the customer storefront preview.');
        } catch (error) {
          showToast(
            `Could not create collection. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`,
          );
        }
        return;
      }

      const redirect = form.dataset.redirect;
      if (redirect) {
        window.location.assign(redirect);
        return;
      }

      form.closest('.modal')?.classList.remove('show');
      showToast('Saved in this frontend preview. Connect the backend to persist it.');
    };

    const handleStorage = (event) => {
      if (event.key !== studioOfferKey) return;
      try {
        currentOffer = readStudioOffer();
        renderCustomerOffer(content, currentOffer);
        renderAdminOffer(content, currentOffer);
      } catch (error) {
        showToast(
          `Could not update the customer offer. ${
            error instanceof Error ? error.message : 'Please try again.'
          }`,
        );
      }
    };
    const offerTimer = window.setInterval(() => {
      renderCustomerOffer(content, currentOffer);
    }, 1000);

    content.addEventListener('click', handleClick);
    content.addEventListener('submit', handleSubmit);
    window.addEventListener('storage', handleStorage);

    return () => {
      content.removeEventListener('click', handleClick);
      content.removeEventListener('submit', handleSubmit);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(offerTimer);
      window.clearTimeout(toastTimerRef.current);
    };
  }, [page, showToast]);

  return (
    <div className="min-h-screen app-shell" ref={contentRef}>
      {parse(page.markup)}
      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById('root'));

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.root = root;
  });
}

root.render(<App />);
