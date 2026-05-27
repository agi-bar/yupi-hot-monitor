import axios from 'axios';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

interface ResolveResult {
  success: boolean;
  realUrl: string;
  originalUrl: string;
  error?: string;
}

interface ValidationResult {
  isValid: boolean;
  statusCode?: number;
  finalUrl: string;
  error?: string;
}

export async function resolveRedirectUrl(redirectUrl: string): Promise<ResolveResult> {
  try {
    const response = await axios.head(redirectUrl, {
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: (status) => status === 301 || status === 302 || status === 303 || status === 307 || status === 308,
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const location = response.headers.location;
    
    if (location) {
      const realUrl = location.startsWith('http') 
        ? location 
        : new URL(location, redirectUrl).href;
      
      return {
        success: true,
        realUrl,
        originalUrl: redirectUrl
      };
    }

    return {
      success: false,
      realUrl: redirectUrl,
      originalUrl: redirectUrl,
      error: 'No redirect location found'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('timeout')) {
      return {
        success: false,
        realUrl: redirectUrl,
        originalUrl: redirectUrl,
        error: 'Timeout resolving URL'
      };
    }

    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      return {
        success: false,
        realUrl: redirectUrl,
        originalUrl: redirectUrl,
        error: 'Host not reachable'
      };
    }

    return {
      success: false,
      realUrl: redirectUrl,
      originalUrl: redirectUrl,
      error: errorMessage
    };
  }
}

export async function resolveWithRedirects(url: string, maxRedirects: number = 10): Promise<string> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    try {
      const response = await axios.head(currentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (location) {
          currentUrl = location.startsWith('http')
            ? location
            : new URL(location, currentUrl).href;
          redirectCount++;
          continue;
        }
      }

      return currentUrl;
    } catch (error) {
      console.error(`Error resolving URL ${currentUrl}:`, error instanceof Error ? error.message : error);
      return currentUrl;
    }
  }

  return currentUrl;
}

export async function validateUrl(url: string): Promise<ValidationResult> {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      validateStatus: (status) => status < 500
    });

    return {
      isValid: response.status < 400,
      statusCode: response.status,
      finalUrl: response.request?.res?.responseUrl || url
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        isValid: false,
        finalUrl: url,
        statusCode: error.response?.status,
        error: error.message
      };
    }
    
    return {
      isValid: false,
      finalUrl: url,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractRealUrlFromBaidu(baiduRedirectUrl: string): string | null {
  const match = baiduRedirectUrl.match(/[?&]url=([^&]+)/);
  if (match) {
    try {
      const decodedUrl = decodeURIComponent(match[1]);
      if (isValidHttpUrl(decodedUrl)) {
        return decodedUrl;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export function extractRealUrlFromBing(bingRedirectUrl: string): string | null {
  const match = bingRedirectUrl.match(/[?&]url=([^&]+)/);
  if (match) {
    try {
      const decodedUrl = decodeURIComponent(match[1]);
      if (isValidHttpUrl(decodedUrl)) {
        return decodedUrl;
      }
      return null;
    } catch {
      return null;
    }
  }

  const idMatch = bingRedirectUrl.match(/id=([^&]+)/);
  if (idMatch) {
    try {
      const decodedUrl = decodeURIComponent(idMatch[1]);
      if (isValidHttpUrl(decodedUrl)) {
        return decodedUrl;
      }
      return null;
    } catch {
      return null;
    }
  }

  return null;
}

export function extractRealUrlFromSogou(sogouRedirectUrl: string, baseUrl: string = 'https://www.sogou.com'): string | null {
  if (sogouRedirectUrl.startsWith('/link?url=')) {
    const match = sogouRedirectUrl.match(/url=([^&]+)/);
    if (match) {
      try {
        const decodedUrl = decodeURIComponent(match[1]);
        if (isValidHttpUrl(decodedUrl)) {
          return decodedUrl;
        }
        return null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function isSearchEngineRedirect(url: string): boolean {
  const redirectDomains = [
    'baidu.com/link',
    'bing.com/cr',
    'bing.com/redirect',
    'sogou.com/link',
    'google.com/url',
    'duckduckgo.com/l/'
  ];

  return redirectDomains.some(domain => url.includes(domain));
}

export async function resolveSearchEngineUrl(url: string): Promise<string> {
  if (!isSearchEngineRedirect(url)) {
    return url;
  }

  if (url.includes('baidu.com/link')) {
    const extracted = extractRealUrlFromBaidu(url);
    if (extracted) return extracted;
  }

  if (url.includes('bing.com/')) {
    const extracted = extractRealUrlFromBing(url);
    if (extracted) return extracted;
  }

  if (url.includes('sogou.com/link')) {
    const extracted = extractRealUrlFromSogou(url);
    if (extracted) return extracted;
  }

  const result = await resolveRedirectUrl(url);
  return result.success ? result.realUrl : url;
}
