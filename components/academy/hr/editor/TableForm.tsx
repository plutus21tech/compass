'use client'

import { AddRowButton, RemoveRowButton, TextField, type BlockFormProps } from './fields'
import { removeAt, replaceAt } from './list-ops'

export function DataTableForm({ block, onChange, isSafe }: BlockFormProps<'dataTable'>) {
  const { headers, rows } = block
  const columns = headers.length
  const withRows = (next: string[][]) => ({ ...block, rows: next })
  const withoutColumn = (column: number) => ({
    ...block,
    headers: removeAt(headers, column),
    rows: rows.map((row) => removeAt(row, column)),
  })
  const setCell = (rowIndex: number, column: number, value: string) =>
    onChange(withRows(replaceAt(rows, rowIndex, replaceAt(rows[rowIndex], column, value))))

  return (
    <>
      <div className="flex items-start gap-2">
        {headers.map((header, column) => (
          <div key={column} className="flex min-w-0 flex-1 items-start gap-1">
            <TextField
              label={`Column ${column + 1} heading`}
              value={header}
              onChange={(value) => onChange({ ...block, headers: replaceAt(headers, column, value) })}
            />
            {columns > 1 ? (
              <RemoveRowButton label={`Remove column ${column + 1}`} allowed={isSafe(withoutColumn(column))} onClick={() => onChange(withoutColumn(column))} />
            ) : null}
          </div>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-start gap-2">
          {row.map((cell, column) => (
            <TextField
              key={column}
              label={`Row ${rowIndex + 1}, ${headers[column] || `column ${column + 1}`}`}
              value={cell}
              onChange={(value) => setCell(rowIndex, column, value)}
            />
          ))}
          <RemoveRowButton label={`Remove row ${rowIndex + 1}`} allowed={isSafe(withRows(removeAt(rows, rowIndex)))} onClick={() => onChange(withRows(removeAt(rows, rowIndex)))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <AddRowButton label="Add a row" onClick={() => onChange(withRows([...rows, headers.map(() => '')]))} />
        <AddRowButton
          label="Add a column"
          onClick={() => onChange({ ...block, headers: [...headers, ''], rows: rows.map((row) => [...row, '']) })}
        />
      </div>
    </>
  )
}
