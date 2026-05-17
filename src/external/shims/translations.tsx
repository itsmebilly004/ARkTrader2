import React from "react";

type Replacements = Record<string, string | number | React.ReactNode>;

const interpolate = (template: string, values?: Replacements): string => {
  if (!values) return template;
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

export const localize = (template: string, values?: Replacements): string =>
  interpolate(template, values);

export const localizeWithMustache = localize;

export const getInitialLanguage = (): string => "EN";

export const getAllowedLanguages = (): Record<string, string> => ({ EN: "English" });

export type TLocalize = typeof localize;

export type LocalizeProps = {
  i18n_default_text: string;
  values?: Replacements;
  components?: React.ReactNode[];
};

export const Localize: React.FC<LocalizeProps> = ({ i18n_default_text, values, components }) => {
  const text = interpolate(i18n_default_text, values);
  if (!components || components.length === 0) {
    return <>{text}</>;
  }
  const parts = text.split(/(<\d+>.*?<\/\d+>|<\d+\s*\/>)/g);
  return (
    <>
      {parts.map((part, idx) => {
        const match = part.match(/^<(\d+)>(.*?)<\/\d+>$/) || part.match(/^<(\d+)\s*\/>$/);
        if (match) {
          const componentIndex = parseInt(match[1], 10);
          const inner = match[2];
          const node = components[componentIndex];
          if (React.isValidElement(node)) {
            return React.cloneElement(node, { key: idx }, inner ?? (node as React.ReactElement).props?.children);
          }
          return <React.Fragment key={idx}>{inner}</React.Fragment>;
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
};

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export default {
  localize,
  localizeWithMustache,
  Localize,
  TranslationProvider,
  getInitialLanguage,
  getAllowedLanguages,
};
