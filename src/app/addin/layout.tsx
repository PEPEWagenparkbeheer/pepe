// Minimale layout voor de Outlook add-in task pane — geen nav, geen sidebar.
export default function AddinLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>PEPE BREIN</title>
        <script
          src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
          type="text/javascript"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
