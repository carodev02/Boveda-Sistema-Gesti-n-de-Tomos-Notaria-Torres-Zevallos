type TauriWindow=Window&{__TAURI_INTERNALS__?:unknown;__TAURI__?:unknown};
export function isTauriEnvironment(){return typeof window!=='undefined'&&Boolean((window as TauriWindow).__TAURI_INTERNALS__||(window as TauriWindow).__TAURI__)}
