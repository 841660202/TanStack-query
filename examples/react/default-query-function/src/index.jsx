/* eslint-disable jsx-a11y/anchor-is-valid */
import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import {
  useQuery,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Define a default query function that will receive the query key
const defaultQueryFn = async (op) => {
  const { queryKey } = op
  console.log('op', op)
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com${queryKey[0]}`,
  )
  return data
}

// provide the default query function to your app via the query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
    },
  },
})

function App() {
  const [postId, setPostId] = React.useState(-1)

  return (
    <QueryClientProvider client={queryClient}>
      <p>
        As you visit the posts below, you will notice them in a loading state
        the first time you load them. However, after you return to this list and
        click on any posts you have already visited again, you will see them
        load instantly and background refresh right before your eyes!{' '}
        <strong>
          (You may need to throttle your network speed to simulate longer
          loading sequences)
        </strong>
      </p>
      {postId > -1 ? (
        <Post postId={postId} setPostId={setPostId} />
      ) : (
        <Posts setPostId={setPostId} />
      )}
      <ReactQueryDevtools initialIsOpen />
    </QueryClientProvider>
  )
}

function Posts({ setPostId }) {
  const queryClient = useQueryClient()

  // All you have to do now is pass a key!
  const { status, data, error, isFetching } = useQuery({
    queryKey: ['/posts'],
  })

  return (
    <div>
      <h1>Posts</h1>
      <div>
        {status === 'pending' ? (
          'Loading...'
        ) : status === 'error' ? (
          <span>Error: {error.message}</span>
        ) : (
          <>
            <div>
              {data.map((post) => (
                <p key={post.id}>
                  <a
                    onClick={() => setPostId(post.id)}
                    href="#"
                    style={
                      // We can use the queryCache here to show bold links for
                      // ones that are cached
                      queryClient.getQueryData(['post', post.id])
                        ? {
                            fontWeight: 'bold',
                            color: 'green',
                          }
                        : {}
                    }
                  >
                    {post.title}
                  </a>
                </p>
              ))}
            </div>
            <div>{isFetching ? 'Background Updating...' : ' '}</div>
          </>
        )}
      </div>
    </div>
  )
}

function Post({ postId, setPostId }) {
  // You can even leave out the queryFn and just go straight into options
  const { status, data, error, isFetching } = useQuery({
    queryKey: [`/posts/${postId}`],
    enabled: !!postId,
  })

  return (
    <div>
      <div>
        <a onClick={() => setPostId(-1)} href="#">
          Back
        </a>
      </div>
      {!postId || status === 'pending' ? (
        'Loading...'
      ) : status === 'error' ? (
        <span>Error: {error.message}</span>
      ) : (
        <>
          <h1>{data.title}</h1>
          <div>
            <p>{data.body}</p>
          </div>
          <div>{isFetching ? 'Background Updating...' : ' '}</div>
        </>
      )}
    </div>
  )
}

const rootElement = document.getElementById('root')
ReactDOM.createRoot(rootElement).render(<App />)
