export function navigateTo(url: string) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new Event('popstate'));
}

export function getCurrentRoute() {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '', params: new URLSearchParams() };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    params: new URLSearchParams(window.location.search),
  };
}

