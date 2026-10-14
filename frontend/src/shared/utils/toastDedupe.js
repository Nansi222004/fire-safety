import toast from 'react-hot-toast';

// The API client (shared/utils/api.js) already shows every failed request as a toast with the id
// `api-err-<message>`, and many pages show `error.message` again in their own catch blocks. Giving every string
// error toast that same message-based id (unless the caller passes its own) makes react-hot-toast merge the two
// into a single toast instead of stacking duplicates.
const ERROR_ID_PREFIX = 'api-err-';

export const installErrorToastDedupe = () => {
  if (toast.error.__dedupeInstalled) return;
  const originalError = toast.error;
  const dedupedError = (message, options = {}) =>
    originalError(message, typeof message === 'string' && !options.id ? { ...options, id: `${ERROR_ID_PREFIX}${message}` } : options);
  dedupedError.__dedupeInstalled = true;
  toast.error = dedupedError;
};

installErrorToastDedupe();
