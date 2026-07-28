import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export function childEnvironment(overrides = {}) {
  const environment = {
    ...process.env,
    ...overrides
  };

  if (process.platform !== "win32") {
    return environment;
  }

  const pathKeys = Object.keys(environment).filter(
    (key) => key.toLowerCase() === "path"
  );
  const currentPath =
    pathKeys.map((key) => environment[key]).find(Boolean) ?? "";
  for (const key of pathKeys) {
    delete environment[key];
  }

  const dockerDirectories = [
    process.env.LOCALAPPDATA
      ? join(
          process.env.LOCALAPPDATA,
          "Programs",
          "DockerDesktop",
          "resources",
          "bin"
        )
      : undefined,
    process.env.ProgramFiles
      ? join(
          process.env.ProgramFiles,
          "Docker",
          "Docker",
          "resources",
          "bin"
        )
      : undefined,
    process.env.ProgramFiles
      ? join(
          process.env.ProgramFiles,
          "DockerDesktop",
          "resources",
          "bin"
        )
      : undefined
  ].filter(
    (directory) =>
      directory && existsSync(join(directory, "docker.exe"))
  );

  environment.Path = [
    ...dockerDirectories,
    ...currentPath.split(delimiter).filter(Boolean)
  ].join(delimiter);

  return environment;
}
