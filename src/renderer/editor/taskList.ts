import { Plugin } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';

/** Toggles a task list item's checkbox when the user clicks the box in its margin. */
export const taskCheckbox = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          mousedown: (view, event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return false;
            const item = target.closest('li[data-item-type="task"]');
            if (!(item instanceof HTMLElement) || item !== target) return false;
            // The checkbox is drawn in the item's left margin, before its content.
            const content = item.firstElementChild?.getBoundingClientRect();
            if (!content || event.clientX >= content.left) return false;
            const pos = view.posAtDOM(item, 0) - 1;
            const node = view.state.doc.nodeAt(pos);
            if (!node || node.type.name !== 'list_item') return false;
            event.preventDefault();
            view.dispatch(
              view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                checked: !node.attrs['checked'],
              }),
            );
            return true;
          },
        },
      },
    }),
);
