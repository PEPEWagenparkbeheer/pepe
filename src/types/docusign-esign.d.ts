// docusign-esign ships geen TypeScript-types en er is geen @types-pakket.
// Ambient declaratie zodat de import typecheckt (runtime-API blijft dynamisch).
declare module 'docusign-esign';
