import Link from 'next/link'
import { FiClock } from 'react-icons/fi'
import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const currentUser = await getCurrentUser()
  const features = [
    {
      // icon: FiClock,
      title: 'Time Tracking',
      description: 'Track time with a simple timer or enter hours manually. Real-time updates and running timers.',
    },
    {
      // icon: FiFolder,
      title: 'Project Management',
      description: 'Organize work by projects and clients. Assign teams, and track progress.',
    },
    {
      // icon: FiUsers,
      title: 'Team Management',
      description: 'Manage team members, roles, and permissions. Track capacity and utilization.',
    },
    {
      // icon: FiBarChart2,
      title: 'Powerful Reports',
      description: 'Generate detailed reports on time, projects, and team performance.',
    },
    {
      // icon: FiCheckCircle,
      title: 'Time Approval',
      description: 'Review and approve team time entries. Lock entries for accuracy.',
    },
    {
      // icon: FiDollarSign,
      title: 'Project Insights',
      description: 'Track time and manage projects efficiently.',
    },
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 theme-color-bg border-b">
        <div className="max-w-[1230px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex justify-between items-center">
              <Link href="/" className="flex items-center space-x-2 shrink-0">
              <FiClock className="w-7 h-7" />
              <span className="text-lg font-bold">Multitime</span>
            </Link>
            <div className="flex space-x-4">
              {currentUser ? (
                <Link
                  href={currentUser?.role === 'admin' || currentUser?.role === 'manager' ? '/admin' : '/dashboard'}
                  className="btn-primary-lite px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/auth/signin"
                    className="btn-primary-lite px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-[1230px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Time Tracking & Project Management
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            A comprehensive proof of concept for a Harvest-like application built with Sanity CMS and Next.js.
            Track time, manage projects, and generate insightful reports.
          </p>
          <div className="flex justify-center space-x-4">
            {currentUser ? (
              <Link
                href={currentUser?.role === 'admin' || currentUser?.role === 'manager' ? '/admin' : '/dashboard'}
                className="btn-primary px-8 py-3 text-lg font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-lg"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/signin"
                className="btn-primary px-8 py-3 text-lg font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-lg"
              >
                Get Started
              </Link>
            )}
            {/* <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 text-lg font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 shadow-lg"
            >
              View on GitHub
            </a> */}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-[1230px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h3 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Key Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 shadow-custom hover:shadow-custom-lg transition-shadow"
            >
              {/* <feature.icon className="w-12 h-12 text-primary-600 mb-4" /> */}
              <h4 className="text-xl font-semibold text-gray-900 mb-2">
                {feature.title}
              </h4>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack Section */}
      {/* <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-xl p-8 shadow-custom">
          <h3 className="text-3xl font-bold text-center text-gray-900 mb-8">
            Built With Modern Technologies
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-primary-600 mb-2">Next.js 14</div>
              <p className="text-gray-600">App Router</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-600 mb-2">Sanity.io</div>
              <p className="text-gray-600">Headless CMS</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-600 mb-2">TypeScript</div>
              <p className="text-gray-600">Type Safety</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-600 mb-2">Tailwind CSS</div>
              <p className="text-gray-600">Styling</p>
            </div>
          </div>
        </div>
      </section> */}

      {/* Footer */}
      <footer className="bg-white mt-16">
        <div className="max-w-[1216px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-gray-600">
            © {new Date().getFullYear()} Multitime. Built as a demonstration project.
          </p>
        </div>
      </footer>
    </main>
  )
}

