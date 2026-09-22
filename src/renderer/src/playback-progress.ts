// Renderer operations can still be waiting here before they reach the main store's queue.
// Callers receive rejections for reporting; a failed operation cannot poison later work.
const pendingProgress = new Map<string, Promise<unknown>>()

export const queueProgress = <T>(videoId: string, operation: () => Promise<T>): Promise<T> => {
  const previous = pendingProgress.get(videoId) ?? Promise.resolve()
  const result = previous.then(operation, operation)
  pendingProgress.set(videoId, result)
  const release = (): void => {
    if (pendingProgress.get(videoId) === result) pendingProgress.delete(videoId)
  }
  void result.then(release, release)
  return result
}

// Capture all already-queued work, including departure checkpoints and completion removals.
// Do not serialize mutations behind reads: an obsolete listing must not block Forget progress.
export const listProgress = async () => {
  await Promise.allSettled([...pendingProgress.values()])
  return window.vacuumStream.playbackProgress.list()
}
