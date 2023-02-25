/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import PageWrapper from '@renderer/common/PageWrapper'
import IndexPage from '@renderer/pages'
import FindPage from '@renderer/pages/find'
import TrayPage from '@renderer/pages/tray'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'

const router = createHashRouter([
  {
    path: '/',
    element: <IndexPage />,
  },
  {
    path: '/find',
    element: <FindPage />,
  },
  {
    path: '/tray',
    element: <TrayPage />,
  },
])

const container = document.getElementById('root')
if (container == null) throw new Error('container is null')

const root = createRoot(container)
root.render(
  <PageWrapper>
    <RouterProvider router={router} />
  </PageWrapper>,
)
