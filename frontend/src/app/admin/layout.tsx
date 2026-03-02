export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#08080f', minHeight: '100vh' }}>
      {children}
    </div>
  )
}
