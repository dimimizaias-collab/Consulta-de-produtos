/**
 * Keyboard navigation helper for editable tables.
 *
 * Usage: add to every navigable <input>:
 *   data-nav-table="<tableId>"
 *   data-nav-row={rowIndex}
 *   data-nav-col={colIndex}
 *   onKeyDown={tableCellKeyDown('<tableId>', rowIndex, colIndex)}
 *
 * ↑/↓  → move focus to the same column in the row above/below
 * ←/→  → native browser behaviour (cursor movement inside the field)
 */
export function tableCellKeyDown(
  tableId: string,
  row: number,
  col: number,
): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  return (e) => {
    const targetRow =
      e.key === 'ArrowDown' ? row + 1
      : e.key === 'ArrowUp' ? row - 1
      : null;

    // Ignore every key except ↑/↓, and clamp at the top boundary
    if (targetRow === null || targetRow < 0) return;

    const target = document.querySelector<HTMLInputElement>(
      `[data-nav-table="${tableId}"][data-nav-row="${targetRow}"][data-nav-col="${col}"]`,
    );
    // No matching cell (bottom boundary, or column not editable right now) — do nothing
    if (!target) return;

    // Prevent the default ↑/↓ behaviour (increments/decrements type="number" inputs)
    e.preventDefault();
    target.focus();

    // Place the cursor at the start when moving down, at the end when moving up —
    // matches Excel / Google Sheets behaviour for text inputs.
    if (target.type !== 'number') {
      const pos = e.key === 'ArrowDown' ? 0 : target.value.length;
      target.setSelectionRange(pos, pos);
    }
  };
}
