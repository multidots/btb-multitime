import ManageServer from './ManageServer'

interface ManagePageProps {
  searchParams: { tab?: string }
}

export default function ManagePage({ searchParams }: ManagePageProps) {
  return <ManageServer searchParams={searchParams} />
}