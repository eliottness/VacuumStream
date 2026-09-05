export const TWITCH_SCOPES = "user:read:follows"

type ParsedVideosInput = {
  readonly after?: string | undefined
  readonly first: number
  readonly userId: string
}

export const createDeviceTokenBody = (clientId: string, deviceCode: string): URLSearchParams =>
  new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    scopes: TWITCH_SCOPES,
  })

export const createVideoSearchParams = (
  input: ParsedVideosInput,
): Readonly<Record<string, string | number>> => ({
  ...(input.after === undefined ? {} : { after: input.after }),
  first: input.first,
  type: "archive",
  user_id: input.userId,
})

export const shouldRefreshResponse = (status: number): boolean => status === 401

export const isAllowedActivationUrl = (value: string): boolean => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.origin === "https://www.twitch.tv" &&
    url.pathname === "/activate" &&
    url.username === "" &&
    url.password === ""
  )
}

export const isIdentityCacheCurrent = (
  checkedAt: number,
  tokenExpiresAt: string,
  now: number,
): boolean => now - checkedAt < 3_600_000 && now < Date.parse(tokenExpiresAt) - 60_000
