export const DISPLAY_WIDTH = 1920;
export const DISPLAY_HEIGHT = 1080;
export const DISPLAY_MARGIN = 0.04;

export function isTvBrowser(userAgent = '', touchPoints = 0) {
  return (
    /smart[ -]?tv|hbbtv|netcast|nettv|web[o0]s|tizen|viera|googletv|google tv|android tv|aft[a-z0-9]+|bravia|vidaa|hisense|philips.*tv|orion.*tv/i.test(
      userAgent
    ) ||
    (/Android/i.test(userAgent) && !/Mobile|Tablet/i.test(userAgent) && touchPoints === 0)
  );
}

export function initialDisplayMode({ search = '', saved = null, userAgent = '', touchPoints = 0 }) {
  const choice = new URLSearchParams(search).get('display');
  if (choice === '1' || choice === '0') return choice === '1';
  if (saved === '1' || saved === '0') return saved === '1';
  return isTvBrowser(userAgent, touchPoints);
}

// Keep desktop proportions on TVs reporting a 960px or 1280px viewport.
// Reserve room on every edge for the part hidden by TV overscan.
export function fitDisplay(width, height, contentHeight = DISPLAY_HEIGHT) {
  const canvasHeight = Math.max(DISPLAY_HEIGHT, contentHeight);
  const scale = Math.min(
    (width * (1 - DISPLAY_MARGIN * 2)) / DISPLAY_WIDTH,
    (height * (1 - DISPLAY_MARGIN * 2)) / canvasHeight
  );
  return {
    width: DISPLAY_WIDTH,
    height: canvasHeight,
    left: (width - DISPLAY_WIDTH * scale) / 2,
    top: (height - canvasHeight * scale) / 2,
    transform: `scale(${scale})`,
  };
}
