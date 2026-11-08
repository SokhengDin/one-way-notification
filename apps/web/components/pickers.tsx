"use client";

// Searchable pickers for users and external systems: people choose by name,
// the form gets the id. The chosen option is remembered so its label stays
// visible after the search text changes.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Combobox, type ComboboxOption } from "./combobox";
import { listExternalSystems } from "@/lib/api/external-systems";
import { listUsers } from "@/lib/api/users";

interface PickerProps {
  readonly label?:       string;
  readonly value:        string;
  readonly onChange:     (id: string, label: string) => void;
  readonly placeholder?: string;
  readonly hint?:        string;
  readonly error?:       string;
  readonly hideLabel?:   boolean;
  /** offer an "All …" choice that maps to "" (for filters) */
  readonly allLabel?:    string;
}

const ALL = "__all__";

function useRemembered(options: ReadonlyArray<ComboboxOption>, value: string) {
  const [remembered, setRemembered] = useState<ComboboxOption | null>(null);
  const merged =
    remembered && remembered.value === value && !options.some((option) => option.value === value)
      ? [remembered, ...options]
      : options;
  return { merged, remember: setRemembered };
}

export function UserPicker({ label = "User", value, onChange, placeholder = "Search by name or email…", hint, error, hideLabel }: PickerProps) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["users", { q: search, limit: 20 }],
    queryFn:  () => listUsers({ skip: 0, limit: 20, q: search || undefined }),
  });
  const options = (query.data?.data.items ?? []).map((user) => ({
    value:       user.id,
    label:       user.display_name,
    description: user.email && user.email !== user.display_name ? user.email : undefined,
  }));
  const { merged, remember } = useRemembered(options, value);

  return (
    <Combobox
      label={label}
      value={value}
      onValueChange={(id) => {
        const option = merged.find((candidate) => candidate.value === id);
        if (option) remember(option);
        onChange(id, option?.label ?? "");
      }}
      options={merged}
      search={search}
      onSearchChange={setSearch}
      placeholder={placeholder}
      emptyMessage="No users match."
      isLoading={query.isLoading}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
    />
  );
}

export function SystemPicker({ label = "External system", value, onChange, placeholder = "Select an external system…", hint, error, hideLabel, allLabel }: PickerProps) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["external-systems", { name: search, limit: 50 }],
    queryFn:  () => listExternalSystems({ skip: 0, limit: 50, name: search || undefined }),
  });
  const options = [
    ...(allLabel ? [{ value: ALL, label: allLabel }] : []),
    ...(query.data?.data.items ?? []).map((system) => ({ value: system.id, label: system.name })),
  ];
  const { merged, remember } = useRemembered(options, value);

  return (
    <Combobox
      label={label}
      value={value === "" && allLabel ? ALL : value}
      onValueChange={(id) => {
        if (id === ALL) return onChange("", allLabel ?? "");
        const option = merged.find((candidate) => candidate.value === id);
        if (option) remember(option);
        onChange(id, option?.label ?? "");
      }}
      options={merged}
      search={search}
      onSearchChange={setSearch}
      placeholder={placeholder}
      emptyMessage="No systems match."
      isLoading={query.isLoading}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
    />
  );
}
