import { Event } from './event.js';
/**
 * Mouse click event. Fired on left-button release without drag, only when
 * mouse tracking is enabled (i.e. inside <AlternateScreen>).
 *
 * Bubbles from the deepest hit node up through parentNode. Call
 * stopImmediatePropagation() to prevent ancestors' onClick from firing.
 */
export class ClickEvent extends Event {
    constructor(col, row, cellIsBlank) {
        super();
        /**
         * Click column relative to the current handler's Box (col - box.x).
         * Recomputed by dispatchClick before each handler fires, so an onClick
         * on a container sees coords relative to that container, not to any
         * child the click landed on.
         */
        this.localCol = 0;
        /** Click row relative to the current handler's Box (row - box.y). */
        this.localRow = 0;
        this.col = col;
        this.row = row;
        this.cellIsBlank = cellIsBlank;
    }
}
