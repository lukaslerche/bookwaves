# Trust auth cookie for kiosk session resume

BookWaves runs in kiosk-device environments where a browser reload should preserve the active user session without extra Alma API calls. Interactive login must validate the submitted login secret against Alma, but session resume from the app-issued auth cookie trusts a non-empty cookie value and restores the active user locally. This deliberately trades immediate detection of Alma account changes for seamless kiosk reloads and reduced Alma traffic; logout and cookie expiry remain the local session-ending mechanisms.
