export interface DeviceLike {
  id: string;
  type: string;
}

export function pickSmartDeviceId(
  onlineDevices: DeviceLike[],
  selectedDeviceId: string | undefined,
  preferredDeviceId: string | undefined
): string | undefined {
  if (onlineDevices.length === 0) {
    return undefined;
  }
  if (selectedDeviceId && onlineDevices.some((d) => d.id === selectedDeviceId)) {
    return selectedDeviceId;
  }
  if (preferredDeviceId && onlineDevices.some((d) => d.id === preferredDeviceId)) {
    return preferredDeviceId;
  }
  const emulator = onlineDevices.find((d) => d.type === 'emulator');
  return emulator?.id || onlineDevices[0].id;
}
