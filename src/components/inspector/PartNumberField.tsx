import * as React from 'react'
import { Link, ExternalLink } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip } from '../ui/tooltip'
import { openDatasheetReference } from '../../utils/datasheet'

type PartNumberFieldProps = {
  id: string
  value: string
  onValueChange: (next: string) => void
  datasheetRef?: string
  onDatasheetChange: (next: string | undefined) => void
  partLabel: string
}

export function PartNumberField({
  id,
  value,
  onValueChange,
  datasheetRef,
  onDatasheetChange,
  partLabel,
}: PartNumberFieldProps) {
  const [isDialogOpen, setDialogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(datasheetRef ?? '')

  const openDialog = () => {
    setDraft(datasheetRef ?? '')
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
  }

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault()
    const trimmed = draft.trim()
    onDatasheetChange(trimmed ? trimmed : undefined)
    closeDialog()
  }

  const handleClear = () => {
    setDraft('')
    onDatasheetChange(undefined)
    closeDialog()
  }

  const handleOpenDatasheet = () => {
    const opened = openDatasheetReference(datasheetRef)
    if (!opened) {
      console.warn('Unable to open datasheet reference', datasheetRef)
    }
  }

  const hasDatasheet = Boolean(datasheetRef && datasheetRef.trim().length)
  const dialogTitleId = `${id}-datasheet-dialog-title`

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            id={id}
            className="input flex-1"
            value={value}
            onChange={event => onValueChange(event.target.value)}
          />
          <Tooltip label="Add datasheet link or path">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Add ${partLabel} datasheet link or path`}
              onClick={openDialog}
            >
              <Link className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label={hasDatasheet ? 'Open datasheet' : 'No datasheet available'}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={hasDatasheet ? `Open ${partLabel} datasheet` : 'No datasheet available'}
              disabled={!hasDatasheet}
              onClick={hasDatasheet ? handleOpenDatasheet : undefined}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        {hasDatasheet ? (
          <div className="text-xs text-slate-500 truncate" title={datasheetRef}>
            {datasheetRef}
          </div>
        ) : null}
      </div>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
          <div className="absolute inset-0 bg-black/40" onClick={closeDialog} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 id={dialogTitleId} className="text-lg font-semibold text-slate-900">
                  {`Add ${partLabel} Datasheet`}
                </h2>
                <Button type="button" size="sm" variant="outline" onClick={closeDialog}>
                  Close
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-4 text-sm">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`${id}-datasheet-input`}>
                    Datasheet link or local path
                  </label>
                  <input
                    id={`${id}-datasheet-input`}
                    className="input w-full"
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder="https://example.com/datasheet.pdf"
                    autoFocus
                  />
                  <p className="text-xs text-slate-500">
                    Paste a URL or local path to open this part&apos;s datasheet quickly from the inspector.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 border-t pt-3">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="button" variant="outline" onClick={handleClear}>
                    Clear link
                  </Button>
                  <Button type="submit" variant="success">
                    Save link
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}


