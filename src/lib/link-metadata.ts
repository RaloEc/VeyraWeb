export interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  domain: string;
  favicon: string;
  image?: string | null;
}

/**
 * Obtiene metadatos OpenGraph (título, descripción, imagen de portada y favicon)
 * para una URL dada. Cuenta con un timeout estricto de 3.5s y un fallback local
 * instantáneo para garantizar que el editor nunca se congele.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata> {
  const cleanUrl = rawUrl.trim();
  const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

  let domain = cleanUrl;
  let defaultTitle = cleanUrl;
  let favicon = '';

  try {
    const parsed = new URL(fullUrl);
    domain = parsed.hostname.replace(/^www\./, '');
    favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    // Derivar un título legible del path en caso de fallback
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      const last = decodeURIComponent(pathSegments[pathSegments.length - 1])
        .replace(/[-_]+/g, ' ')
        .replace(/\.[a-zA-Z0-9]+$/, '');
      if (last.length > 2) {
        defaultTitle = last.charAt(0).toUpperCase() + last.slice(1);
      } else {
        defaultTitle = domain;
      }
    } else {
      defaultTitle = domain;
    }
  } catch {
    // Si la URL no es válida, devolvemos fallback básico
    return {
      url: fullUrl,
      title: cleanUrl,
      description: cleanUrl,
      domain: cleanUrl,
      favicon: '',
      image: null,
    };
  }

  const fallbackData: LinkMetadata = {
    url: fullUrl,
    title: defaultTitle,
    description: '',
    domain,
    favicon,
    image: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(fullUrl)}`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return fallbackData;

    const data = await res.json();
    if (data.status === 'success' && data.data) {
      const d = data.data;
      return {
        url: fullUrl,
        title: d.title || fallbackData.title,
        description: d.description || '',
        domain: domain,
        favicon: d.logo?.url || favicon,
        image: d.image?.url || null,
      };
    }
  } catch {
    // Fallback silencioso por timeout o restricción de red
  }

  return fallbackData;
}

