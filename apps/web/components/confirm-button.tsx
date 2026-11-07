"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./button";

interface ConfirmButtonProps {
  readonly label:         string;
  readonly title:         string;
  readonly description:   string;
  readonly confirmLabel?: string;
  readonly pendingLabel?: string;
  readonly isPending?:    boolean;
  readonly variant?:      "danger" | "outline" | "ghost";
  readonly size?:         "default" | "sm";
  readonly onConfirm:     () => void;
}

/** A destructive action behind an "are you sure?" dialog. */
export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  isPending    = false,
  variant      = "danger",
  size         = "default",
  onConfirm,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} disabled={isPending}>
        {isPending ? pendingLabel : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
