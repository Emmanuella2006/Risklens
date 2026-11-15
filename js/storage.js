// Saves the list of sites in the browser, so it is still there after a refresh.
const STORAGE_KEY = 'risklens.sites';

export function loadSites() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveSites(sites) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    return true;
  } catch {
    return false;
  }
}
