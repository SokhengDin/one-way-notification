"use client"

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Same look as file-vault's toasts: a white card with a coloured bar down the
// left edge and a matching icon, stacked bottom-right. Styled from scratch
// (unstyled) so nothing from sonner's default theme leaks through.
const BASE =
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-zinc-200 bg-white py-3 pr-9 pl-4 text-zinc-900 shadow-lg " +
  "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] " +
  "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
    position="bottom-right"
    closeButton
    visibleToasts={5}
    gap={8}
    style={{ "--width": "384px" } as React.CSSProperties}
    icons={{
      success: <CircleCheck className="size-[18px] text-emerald-600 dark:text-emerald-400" />,
      error:   <CircleAlert className="size-[18px] text-red-600 dark:text-red-400" />,
      warning: <TriangleAlert className="size-[18px] text-amber-600 dark:text-amber-400" />,
      info:    <Info className="size-[18px] text-blue-700 dark:text-blue-400" />,
      loading: <LoaderCircle className="size-[18px] animate-spin text-zinc-500" />,
      close:   <X className="size-4" />,
    }}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast:       BASE,
        default:     "before:bg-zinc-400",
        success:     "before:bg-emerald-500",
        error:       "before:bg-red-500",
        warning:     "before:bg-amber-500",
        info:        "before:bg-blue-600",
        loading:     "before:bg-zinc-400",
        icon:        "mt-0.5 flex shrink-0",
        content:     "min-w-0 flex-1",
        title:       "text-sm font-semibold",
        description: "mt-0.5 text-sm text-zinc-600 dark:text-zinc-300",
        actionButton:
          "mt-0.5 shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
        cancelButton:
          "mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800",
        closeButton:
          "absolute top-2.5 right-2.5 rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
      },
    }}
    {...props}
  />
)

export { Toaster }
