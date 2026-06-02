const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// App-param localStorage keys were historically prefixed `base44_`. They are now
// `veyrnox_`. Migrate any existing value forward on first read so current local
// data isn't orphaned: copy the legacy value to the new key (if the new key is
// empty) and drop the legacy key. Returns the new key to read/write going forward.
const NEW_PREFIX = 'veyrnox_';
const LEGACY_PREFIX = 'base44_';
const migratedKey = (suffix) => {
	const newKey = `${NEW_PREFIX}${suffix}`;
	if (!isNode) {
		const legacyKey = `${LEGACY_PREFIX}${suffix}`;
		const legacyVal = storage.getItem(legacyKey);
		if (legacyVal !== null) {
			if (storage.getItem(newKey) === null) {
				storage.setItem(newKey, legacyVal);
			}
			storage.removeItem(legacyKey);
		}
	}
	return newKey;
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = migratedKey(toSnakeCase(paramName));
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storage.setItem(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = storage.getItem(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('veyrnox_access_token');
		storage.removeItem('base44_access_token'); // drop any pre-migration leftover
		storage.removeItem('token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
	}
}


export const appParams = {
	...getAppParams()
}
