import type { ComponentProps, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface FieldWrapperProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly error?: string;
  readonly hint?: string;
  readonly children: ReactNode;
}

function FieldWrapper({ label, htmlFor, error, hint, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface TextFieldProps extends ComponentProps<typeof Input> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

export function TextField({ label, error, hint, id, name, ...props }: TextFieldProps) {
  const fieldId = id ?? name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <Input id={fieldId} name={name} aria-invalid={!!error} {...props} />
    </FieldWrapper>
  );
}

interface TextAreaFieldProps extends ComponentProps<typeof Textarea> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
}

export function TextAreaField({ label, error, hint, id, name, className, ...props }: TextAreaFieldProps) {
  const fieldId = id ?? name ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <Textarea
        id={fieldId}
        name={name}
        aria-invalid={!!error}
        className={`min-h-28 font-mono ${className ?? ""}`}
        {...props}
      />
    </FieldWrapper>
  );
}

interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps {
  readonly label: string;
  readonly options: ReadonlyArray<SelectFieldOption>;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly error?: string;
  readonly hint?: string;
  readonly id?: string;
  readonly className?: string;
}

export function SelectField({
  label,
  options,
  value,
  onValueChange,
  error,
  hint,
  id,
  className,
}: SelectFieldProps) {
  const fieldId = id ?? label;
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <Select value={value} onValueChange={(next) => onValueChange(next as string)}>
        <SelectTrigger id={fieldId} className={`w-full ${className ?? ""}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly id?: string;
  readonly disabled?: boolean;
}

export function CheckboxField({ label, checked, onCheckedChange, id, disabled }: CheckboxFieldProps) {
  const fieldId = id ?? label;
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={fieldId}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
      />
      <Label htmlFor={fieldId}>{label}</Label>
    </div>
  );
}
