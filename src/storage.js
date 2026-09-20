function getGmValue(key, fallback) {
  if (typeof GM_getValue !== 'function') return fallback;
  try {
    return GM_getValue(key, fallback);
  } catch {
    return fallback;
  }
}

function setGmValue(key, value) {
  if (typeof GM_setValue !== 'function') return false;
  try {
    GM_setValue(key, value);
    return true;
  } catch {
    return false;
  }
}

function deleteGmValue(key) {
  if (typeof GM_deleteValue !== 'function') return false;
  try {
    GM_deleteValue(key);
    return true;
  } catch {
    return false;
  }
}

function getLocalValue(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function getStorageItem(key, fallback = null) {
  const gmValue = getGmValue(key, undefined);
  if (gmValue !== undefined) return gmValue;

  const localValue = getLocalValue(key, fallback);
  if (localValue !== fallback) setGmValue(key, localValue);
  return localValue;
}

export function setStorageItem(key, value) {
  const stringValue = String(value);
  if (!setGmValue(key, stringValue)) {
    try {
      localStorage.setItem(key, stringValue);
    } catch {
      // Storage can be unavailable in strict privacy modes.
    }
  }
}

export function removeStorageItem(key) {
  if (!deleteGmValue(key)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable in strict privacy modes.
    }
  }
}
