declare module 'postcss-custom-properties' {
  import { Plugin } from 'postcss';

  interface Options {
    preserve?: boolean | 'computed';
    importFrom?: string | string[] | Record<string, string>;
    exportTo?: string | string[] | ((customProperties: Record<string, string>) => void);
  }

  const plugin: (options?: Options) => Plugin;

  export default plugin;
}
