import React from 'react'
interface Props {
    children: React.ReactNode;
}
const Layout = ({children}:Props) => {
    return (
        <div className='flex min-h-screen items-center justify-center'>{children}</div>
    )
}
export default Layout
