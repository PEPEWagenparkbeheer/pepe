import TenderResultaat from '@/components/lab/tender/TenderResultaat';

export const metadata = {
  title: 'Tender resultaat — PEPE Flow',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenderResultaat tenderId={id} />;
}
