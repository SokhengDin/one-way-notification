"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

interface ComboboxProps {
  readonly label?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: ReadonlyArray<ComboboxOption>;
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly isLoading?: boolean;
  readonly error?: string;
  readonly hint?: string;
}

export function Combobox({
  label,
  value,
  onValueChange,
  options,
  search,
  onSearchChange,
  placeholder = "Select…",
  emptyMessage = "No results found.",
  isLoading,
  error,
  hint,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const fieldId = label ?? placeholder;

  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={fieldId}
              type="button"
              variant="outline"
              className="w-full justify-between font-normal"
            >
              <span className={cn("truncate", !selected && "text-muted-foreground")}>
                {selected ? selected.label : placeholder}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={onSearchChange}
              placeholder={`Search ${label?.toLowerCase() ?? "options"}…`}
            />
            <CommandList>
              {!isLoading && options.length === 0 && (
                <CommandEmpty>{emptyMessage}</CommandEmpty>
              )}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        option.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
