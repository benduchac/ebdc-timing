// Decides whether a device may overwrite a race's cloud snapshot. The server
// calls this before every write; it is a plain function so a test can pin
// every case without Redis.
//
// A sync uploads the whole snapshot, so the last device to write wins. That
// is only safe if a device never writes over a copy it has not seen. A
// laptop that was handed off, then woke up or was reopened, holds an old copy
// and would roll the cloud back. Each device sends its id and the version
// (`lastSaved`) of the cloud copy it last loaded or wrote.

export interface CurrentVersion {
  lastSaved: string;
  // Absent on snapshots written before this check existed.
  writerId?: string;
}

export interface IncomingWrite {
  writerId?: string;
  // The cloud `lastSaved` this device last loaded or wrote. Null when it has
  // never synced this race.
  baseSavedAt?: string | null;
}

export function isWriteAllowed(
  current: CurrentVersion | null | undefined,
  incoming: IncomingWrite
): boolean {
  // First sync of a race.
  if (!current) return true;
  // Written before devices were tracked: nothing to compare against.
  if (!current.writerId) return true;
  // This device wrote the cloud copy. Covers a response lost on the way back
  // (the write landed but the device never learned the new version) and a
  // reload of the operator tab.
  if (incoming.writerId && incoming.writerId === current.writerId) return true;
  // This device loaded exactly the copy that is there now.
  if (incoming.baseSavedAt && incoming.baseSavedAt === current.lastSaved) {
    return true;
  }
  return false;
}
