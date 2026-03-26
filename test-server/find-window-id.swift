#!/usr/bin/env swift
import CoreGraphics
import Foundation

let appName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "wattson"

guard let windowList = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
    fputs("Failed to get window list\n", stderr)
    exit(1)
}

for window in windowList {
    guard let ownerName = window[kCGWindowOwnerName as String] as? String,
          ownerName.lowercased() == appName.lowercased(),
          let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
          let windowID = window[kCGWindowNumber as String] as? Int else {
        continue
    }
    print(windowID)
    exit(0)
}

fputs("Window not found for app: \(appName)\n", stderr)
exit(1)
