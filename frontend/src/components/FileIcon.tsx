
import React from "react";
import { extensionToIcon, filenameToIcon, folderToIcon } from "../utils/iconMapping";

interface FileIconProps {
    name: string;
    type: "file" | "directory";
    isOpen?: boolean; // For folders
    size?: number;
    className?: string;
}

export const FileIcon: React.FC<FileIconProps> = ({
    name,
    type,
    isOpen = false,
    size = 16,
    className = "",
}) => {
    const getIconPath = () => {
        if (type === "directory") {
            // Check specific folder mapping
            const iconName = folderToIcon[name.toLowerCase()] || "folder";
            const openSuffix = isOpen ? "__open" : "";
            // Handle the case where the icon might be generic 'folder'
            // If it's a specific folder icon like 'folder_src', adding '__open' -> 'folder_src__open'
            // If it is 'folder', adding '__open' -> 'folder__open'
            return `/icons/catppuccin/${iconName}${openSuffix}.svg`;
        }

        const filename = name.toLowerCase();
        // Check exact filename mapping
        if (filenameToIcon[filename]) {
            return `/icons/catppuccin/${filenameToIcon[filename]}.svg`;
        }

        // Special handling for Excalidraw
        if (filename.endsWith(".excalidraw") || filename.endsWith(".excalidraw.md")) {
            return "/icons/catppuccin/excalidraw.svg";
        }

        // Check extension mapping
        const ext = name.split(".").pop()?.toLowerCase();
        if (ext && extensionToIcon[ext]) {
            return `/icons/catppuccin/${extensionToIcon[ext]}.svg`;
        }

        // Default file icon
        return "/icons/catppuccin/file.svg";
    };

    const iconPath = getIconPath();

    return (
        <img
            src={iconPath}
            alt={name}
            width={size}
            height={size}
            className={className}
            style={{ display: "inline-block", verticalAlign: "middle" }}
            onError={(e) => {
                // Fallback to generic icon if specific one fails (e.g. valid extension but missing svg)
                const target = e.target as HTMLImageElement;
                if (type === "directory") {
                    // Prevent infinite loop if fallback also fails
                    if (!target.src.endsWith("folder.svg")) {
                        target.src = isOpen ? "/icons/catppuccin/folder__open.svg" : "/icons/catppuccin/folder.svg";
                    }
                } else {
                    if (!target.src.endsWith("file.svg")) {
                        target.src = "/icons/catppuccin/file.svg";
                    }
                }
            }}
        />
    );
};
