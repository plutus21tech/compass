interface DataTableBlockProps {
  headers: readonly string[]
  rows: ReadonlyArray<readonly string[]>
}

/** A table from tablet up. On a phone each row stacks and every cell carries its header. */
export function DataTableBlock({ headers, rows }: DataTableBlockProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-academy-line bg-white">
      <table role="table" className="w-full text-left text-[15px] leading-6 text-academy-navy max-sm:block">
        <thead className="max-sm:sr-only">
          <tr className="bg-academy-blue-tint">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="divide-y divide-academy-line max-sm:block">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} role="row" className="max-sm:block max-sm:px-4 max-sm:py-3">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  role="cell"
                  className={`px-4 py-3 align-top [overflow-wrap:anywhere] max-sm:block max-sm:px-0 max-sm:py-0.5 ${cell ? '' : 'max-sm:hidden'}`}
                >
                  <span className="block text-sm font-medium text-academy-slate sm:hidden">{headers[cellIndex]}</span>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
