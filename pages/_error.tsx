import { NextPageContext } from 'next'
import Link from 'next/link'

interface ErrorProps {
  statusCode: number
}

function Error({ statusCode }: ErrorProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold', color: '#fff', marginBottom: '1rem' }}>
          {statusCode}
        </h1>
        <p style={{ color: '#9ca3af', marginBottom: '2rem' }}>
          {statusCode === 404
            ? 'Page not found'
            : 'An error occurred'}
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: '#2563eb',
            color: '#fff',
            borderRadius: '0.75rem',
            textDecoration: 'none'
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
