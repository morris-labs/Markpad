import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

/**
 * Opens a link on Ctrl+click (Cmd+click on macOS).
 *
 * A plain click places the cursor in the link text, so the user can edit it.
 */
export function linkClickPlugin(openLink: (href: string) => void) {
  const isMac = navigator.userAgent.includes('Mac');
  return $prose(
    () =>
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (_view, event) => {
              const modifier = isMac ? event.metaKey : event.ctrlKey;
              const target = event.target;
              if (!modifier || !(target instanceof Element)) return false;
              const anchor = target.closest('a[href]');
              if (!anchor) return false;
              event.preventDefault();
              openLink(anchor.getAttribute('href') ?? '');
              return true;
            },
          },
        },
      }),
  );
}
