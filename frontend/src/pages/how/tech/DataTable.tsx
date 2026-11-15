import type { TableSpec } from "./model";
import { rich } from "./rich";
import styles from "./tech.module.css";

// Wide tables scroll inside their own focusable box.
export function DataTable({ table }: { table: TableSpec }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.tableWrap} tabIndex={0} role="group" aria-labelledby={`cap-${table.id}`}>
      <table className={styles.table} id={`tbl-${table.id}`}>
        <caption id={`cap-${table.id}`} className={styles.tableCaption}>
          {table.caption}
        </caption>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    {rich(cell)}
                  </th>
                ) : (
                  <td key={c}>{rich(cell)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
