// noinspection RequiredAttributes

"use client";

import { MutableRefObject, useEffect, useRef, useState } from "react";
import { Item, ItemParams, Menu, Separator } from "react-contexify";
import { FaFileImport } from "react-icons/fa";
import {
    IoIosRepeat,
    IoMdArrowDown,
    IoMdBook,
    IoMdClose,
    IoMdCloudUpload,
    IoMdPause,
    IoMdPlay,
    IoMdSave
} from "react-icons/io";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";

import Button from "@components/Button.tsx";
import Packet from "@components/visualizer/Packet.tsx";

import type { Packet as PacketType } from "@backend/types.ts";

import usePacketList from "@hooks/usePacketList.ts";
import useViewport from "@hooks/useViewport.ts";

import classNames from "classnames";

import "@css/PacketVisualizer.scss";

import PacketInspector from "@components/visualizer/PacketInspector.tsx";

import * as protobuf from "protobufjs";

/// <editor-fold desc="Filtering">
type ComplexFilters = {
    matchAll?: boolean;
    length?: number;
};

/**
 * Creates a packet filter from a packet and the current filters.
 *
 * orand - true == AND, false == OR
 * filter - packet name filter
 * jsonFilter - packet content filter
 */
function packetFilter({
    data: { packetId, packetName, length, data },
    textFilter,
    jsonFilter,
    orand
}: {
    data: PacketType;
    textFilter: string;
    jsonFilter: string;
    orand: boolean; // When true, both filters must match.
}) {
    // Compare the packet's name and ID to the filter.
    const filterResult =
        textFilter.trim().length == 0 ||
        packetId.toString() == textFilter ||
        packetName.toLowerCase().includes(textFilter.toLowerCase());

    // Compare the packet's data to the JSON filter.
    const filters: ComplexFilters = {};
    let parsedFilter = jsonFilter.trim();
    if (parsedFilter.startsWith("@")) {
        let parts = parsedFilter.split(";").map((v) => v.trim());
        parsedFilter = parts[parts.length - 1];

        parts = parts.slice(0, parts.length - 1);
        for (const part of parts) {
            const action = part.substring(1);
            const segments = action.split(".").map((v) => v.trim());
            switch (segments[0]) {
                case "some":
                    filters.matchAll = false;
                    break;
                case "len":
                case "length":
                    filters.length = parseInt(segments[1]);
                    break;
            }
        }
    }

    // Parse the filters and do the comparison.
    let parsed: any | undefined;
    try {
        parsed = JSON.parse(parsedFilter);
    } catch (e) {
        parsed = parsedFilter.split(",").map((v: string) => v.trim());
    }

    let jsonResult = false;
    try {
        jsonResult =
            jsonFilter.trim().length == 0 ||
            (recursiveCompare(
                JSON.parse(data),
                parsed,
                filters.matchAll ?? true
            ) &&
                (filters.length != undefined
                    ? length >= filters.length
                    : true));
    } catch { }

    return orand ? filterResult && jsonResult : filterResult || jsonResult;
}

/**
 * Dynamically generate a proto type name from a CombatTypeArgument string.
 * - For example, "CombatTypeArgument_COMBAT_EVT_BEING_HIT" becomes "EvtBeingHitInfo".
 * - Returns null for unsupported types (e.g. ENTITY_MOVE).
 */
function getDynamicTypeName(argType: string): string | null {
    if (!argType.startsWith("CombatTypeArgument_")) {
        return null;
    }

    // Remove the "CombatTypeArgument_" prefix
    let stripped = argType.replace("CombatTypeArgument_", "");

    // If the type starts with "COMBAT_", remove that prefix and prepend "Evt"
    if (stripped.startsWith("COMBAT")) {
        stripped = stripped.replace("COMBAT", "");
        // Convert from snake_case to CamelCase
        const camel = stripped
            .toLowerCase()
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join("");
        return camel + "Info";
    }

    // Fallback: convert remaining string to CamelCase and append "Info"
    const camel = stripped
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");
    return camel + "Info";
}

/**
 * Recursively determines all values in an object.
 *
 * @param data The data to determine values for.
 */
function allValues(data: any): any[] {
    let values: any[] = [];
    for (const key in data) {
        if (typeof data[key] == "object") {
            values = values.concat(allValues(data[key]));
        } else if (Array.isArray(data[key])) {
            values = values.concat(data[key]);
        } else {
            values.push(data[key]);
        }
    }
    return values;
}

/**
 * Compare two objects recursively by their values.
 *
 * A filter with the following structure:
 * ["test1", "test2"] will match { "randomKey": "test1", "other": "test2", "nested": { "key": "something else" } }
 *
 * A filter with the following structure:
 * ["something else"] will match { "randomKey": "test1", "other": "test2", "nested": { "key": "something else" } }
 *
 * @param data The data to compare.
 * @param filters The filters to compare against. Must match all to return true.
 *
 * @param matchAll Should all filters match to return true?
 */
function recursiveCompare(
    data: object,
    filters: any[],
    matchAll: boolean = true
): boolean {
    const values = allValues(data);

    // declare array of filters as [false]
    // for-each filter as filterVal; if filterVal is in values, mark filter as true
    // if all filters are true, return true

    let passed: boolean[] = [];
    for (const filterVal of filters) {
        passed.push(values.includes(filterVal));
    }

    return matchAll ? passed.every((v) => v) : passed.some((v) => v);
}
/// </editor-fold>

/**
 * Invoked when a 'Copy' action from the context menu is selected.
 */
async function copyPacket({ id, props }: ItemParams<{ packet: PacketType }>) {
    if (props == undefined) {
        alert("Failed to copy packet to clipboard.");
        console.error(
            "Failed to copy packet to clipboard: props is undefined."
        );
        return;
    }
    const { packet } = props;

    try {
        let data = "Unknown copy action.";
        switch (id) {
            case "copy":
                data = packet.data;
                break;
            case "copy-raw":
                data = packet.binary ?? packet.data;
                break;
            case "copy-name":
                data = packet.packetName;
                break;
            case "copy-id":
                data = packet.packetId.toString();
                break;
            case "copy-header":
                data = `// CmdId: ${packet.packetId}\n// Obf: ${packet.packetName}`;
                break;
        }
        await navigator.clipboard.writeText(data);
    } catch (error) {
        alert("Failed to copy packet to clipboard.");
        console.error("Failed to copy packet to clipboard.", error);
    }
}

function Labels() {
    return (
        <div className={"Visualizer_Labels"}>
            <span className={"time"}>Time</span>
            <span className={"index"}>#</span>
            <span className={"source"}>Source</span>
            <span className={"id"}>ID</span>
            <span className={"packet-name"}>Packet Name</span>
            <span className={"length"}>Length</span>
            <span className={"data !justify-start"}>Data</span>
        </div>
    );
}

interface IListProps {
    listRef: MutableRefObject<FixedSizeList | null>;
    height: number;
    viewportHeight: number;
    width: number;
    packets: PacketType[];
    setSelected: (index: number) => void;
    setContent: (data: unknown) => void;
    selected: number | undefined;

    withPadding?: boolean;
    filterShown?: boolean;

    isFiltered?: boolean;
}

function PacketList(props: IListProps) {
    const { packets } = props;

    let padding = props.withPadding ? 82 : 0;
    if (props.filterShown) {
        padding += props.viewportHeight * 0.3 + 35;
    }

    return (
        <FixedSizeList
            ref={(ref) => {
                if (props.isFiltered) return;

                props.listRef.current = ref;
            }}
            height={props.height - padding}
            width={props.width}
            itemSize={34}
            itemCount={packets.length}
        >
            {({ index, style }) => {
                const data = packets[index];
                const usedIndex = data.index ?? index;

                return (
                    <Packet
                        onClick={() => {
                            if (props.isFiltered) {
                                props.listRef.current?.scrollToItem(
                                    usedIndex,
                                    "start"
                                );
                            }
                            props.setSelected(usedIndex);
                            props.setContent(data);
                        }}
                        index={usedIndex}
                        style={style}
                        selected={usedIndex == props.selected}
                        data={data}
                    />
                );
            }}
        </FixedSizeList>
    );
}

interface IProps {
    base?: PacketType[];
    id?: string;
}

/**
 * A React-port of Crepe-Inc/Iridium (now KingRainbow44/Packet-Visualizer).
 */
function PacketVisualizer(props: IProps) {
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<FixedSizeList | null>(null);

    /// <editor-fold desc="State variables">
    const [selected, setSelected] = useState<number | undefined>(undefined);
    const [content, setContent] = useState<unknown | undefined>(undefined);
    const [editorWidth, setEditorWidth] = useState<number>(30);

    const [lockScroll, setLockScroll] = useState<boolean>(false);
    const [searchBoth, setSearchBoth] = useState<boolean>(true);
    const [capturingPcap, setCapturingPcap] = useState<boolean>(false);

    const [filteredPackets, setFilteredPackets] = useState<PacketType[]>([]);
    const [nameFilter, setNameFilter] = useState<string | undefined>(undefined);
    const [jsonFilter, setJsonFilter] = useState<string | undefined>(undefined);
    /// </editor-fold>

    const { height: viewportHeight } = useViewport();
    const { packets, push, clear } = usePacketList(props.base);

    /// <editor-fold desc="Resize functions">
    const onMouseMove = (event: MouseEvent) => {
        const body = bodyRef.current;
        if (!body) return;

        const box = body.getBoundingClientRect();
        const newWidth = Math.min(
            Math.max(
                100 - ((event.clientX - box.left) / body.offsetWidth) * 100,
                10
            ),
            50
        );

        setEditorWidth(newWidth);
    };
    const onMouseUp = () => {
        if (!bodyRef.current) return;

        bodyRef.current.style.userSelect = "auto";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    };
    /// </editor-fold>

    let root = new protobuf.Root();
    const [cmdIdToMessageMap, setCmdIdToMessageMap] = useState<{
        [cmdId: number]: string;
    }>({});
    const [messageSort, setMessageSort] = useState<{ [key: string]: number }>(
        {}
    );

    const rebuildFromProto = (protoText: string): void => {
        try {
            // Parse the proto file content using protobufjs
            const parsed = protobuf.parse(protoText);
            root = parsed.root;
        } catch (error) {
            console.error("Error parsing proto file:", error);
            const statusElement = document.getElementById("status");
            if (statusElement)
                statusElement.innerText = "Error parsing proto file.";
            return;
        }

        // Clear the current map before rebuilding
        Object.keys(cmdIdToMessageMap).forEach(
            (key) => delete cmdIdToMessageMap[Number(key)]
        );

        // Regex to extract CmdId and message names
        let pendingCmdId: number | null = null;
        const cmdIdRegex = /^\/\/\s*CmdId:\s*(\d+)/;
        const messageRegex = /^message\s+(\w+)/;
        const lines = protoText.split(/\r?\n/);

        for (const line of lines) {
            const trimmedLine = line.trim();
            const cmdMatch = trimmedLine.match(cmdIdRegex);
            if (cmdMatch) {
                pendingCmdId = Number(cmdMatch[1]);
                continue;
            }
            const msgMatch = trimmedLine.match(messageRegex);
            if (msgMatch && pendingCmdId !== null) {
                const messageName = msgMatch[1];
                cmdIdToMessageMap[pendingCmdId] = messageName;
                pendingCmdId = null;
            }
        }

        console.log(
            `Proto processed with ${Object.keys(cmdIdToMessageMap).length} cmdId mappings.`
        );
    };

    /**
     * Loads a saved proto file from localStorage and rebuilds the proto.
     */
    const loadSavedProto = (): void => {
        const savedProto = localStorage.getItem("protoFileContent");
        if (savedProto) {
            console.log("Found saved proto file. Rebuilding proto...");
            rebuildFromProto(savedProto);
        } else {
            console.log("No saved proto file found.");
        }
    };

    let globalPacketIndex = 0;

    const listenPcapEventStream = () => {
        // Load protocol definitions
        loadSavedProto();

        // Open the event stream
        const ev = new EventSource("http://localhost:1985/api/stream");

        ev.addEventListener("packetNotify", (e) => {
            // Parse the incoming packet and assign a unique index
            const packet = JSON.parse(e.data) as PacketType;
            packet.index = globalPacketIndex++;

            // If no textual data is present, we decode the binary proto data
            if (packet.data === "") {
                // Map packet ID to proto name and update statistics
                const protoName = cmdIdToMessageMap[packet.packetId];
                packet.packetName = protoName;
                messageSort[protoName] = (messageSort[protoName] || 0) + 1;

                if (packet.binary) {
                    try {
                        // Decode the binary data using the proto type
                        const buffer = Buffer.from(packet.binary, "base64");
                        const Message = root.lookupType(protoName);
                        const decodedMessage = Message.decode(buffer).toJSON();

                        // Special handling for UnionCmdNotify: process its inner command list
                        if (
                            protoName === "UnionCmdNotify" &&
                            Array.isArray(decodedMessage.cmdList)
                        ) {
                            decodedMessage.cmdList.forEach((cmd: any) => {
                                const innerName = cmdIdToMessageMap[cmd.messageId] || "Unknown";
                                let innerObject = {} as any;

                                try {
                                    // Decode the inner command's body from base64
                                    const innerBuffer = Buffer.from(cmd.body, "base64");
                                    innerObject = root.lookupType(innerName).decode(innerBuffer).toJSON();
                                } catch (innerError) {
                                    console.error("Error decoding inner message", innerError);
                                }

                                // Handle CombatInvocationsNotify with potential dynamic type mapping
                                if (innerName === "CombatInvocationsNotify" && innerObject["invokeList"]) {
                                    innerObject.invokeList.forEach((invocation: any) => {
                                        const dataObj = invocation.combatData;
                                        let argType = invocation.argumentType;

                                        // Use helper to dynamically generate the proto type name
                                        const dynamicType = getDynamicTypeName(argType);
                                        if (!dynamicType) return; // Skip if unsupported

                                        try {
                                            const innerBuffer2 = Buffer.from(dataObj, "base64");
                                            const InnerMessage2 = root.lookupType(dynamicType);
                                            const innerObject2 = InnerMessage2.decode(innerBuffer2).toJSON();
                                            const combinedName = `${innerName} - ${dynamicType}`;

                                            // Create and push a new packet for this inner invocation
                                            push({
                                                packetId: 0,
                                                packetName: combinedName,
                                                data: JSON.stringify({ object: innerObject2, raw: cmd.body }),
                                                binary: "",
                                                time: Date.now(),
                                                source: "client",
                                                length: Buffer.from(cmd.body, "base64").length,
                                                index: ++globalPacketIndex,
                                            });
                                        } catch (innerError) {
                                            console.error("Error decoding combat invocation", innerError);
                                        }
                                    });
                                } else {
                                    // For other inner commands, push the decoded message
                                    push({
                                        packetId: cmd.messageId,
                                        packetName: innerName,
                                        data: JSON.stringify({ object: innerObject, raw: cmd.body }),
                                        binary: "",
                                        time: Date.now(),
                                        source: "client",
                                        length: Buffer.from(cmd.body, "base64").length,
                                        index: ++globalPacketIndex,
                                    });
                                }
                            });
                        } else {
                            // For non-UnionCmdNotify packets, simply attach the decoded data
                            packet.data = JSON.stringify(decodedMessage);
                            push(packet);
                        }
                    } catch (error) {
                        console.error("Error decoding proto", error);
                        packet.data = JSON.stringify({ status: -1 });
                        push(packet);
                    }
                } else {
                    // If binary data is missing, return an error status
                    packet.data = JSON.stringify({ status: -2 });
                    push(packet);
                }
            } else {
                // If the packet already contains textual data, push it as is
                push(packet);
            }
        });
    };

    const onClickMessageSort = () => {
        console.log(`cmdIdToMessageMap: `, cmdIdToMessageMap);
        console.log(`messageSort: `, messageSort);
    };
    const onClickUploadPcap = () => {
        const input = document.createElement("input");
        input.hidden = true;
        input.type = "file";
        input.accept = ".gcap,.pcap,.pcapng";
        input.click();
        input.addEventListener("change", async (e: any) => {
            const formData = new FormData();
            formData.append("file", e.target!.files[0]);
            await fetch("http://localhost:1985/api/upload", {
                method: "POST",
                body: formData
            });
        });
    };
    const onClickUploadProto = () => {
        const input = document.createElement("input");
        input.hidden = true;
        input.type = "file";
        input.accept = ".proto";
        input.click();
        input.addEventListener("change", async (e: any) => {
            const formData = new FormData();
            formData.append("file", e.target!.files[0]);
            const file = e.target!.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const protoText = event.target?.result as string;

                // Save the proto content and file name in localStorage
                localStorage.setItem("protoFileContent", protoText);
                rebuildFromProto(protoText);
            };
            reader.readAsText(file);
        });
    };
    const stopPcap = async () => {
        const res = await fetch("http://localhost:1985/api/stop");
        if (res.ok) {
            setCapturingPcap(false);
        }
    };
    const startPcap = async () => {
        if (capturingPcap) {
            return await stopPcap();
        }
        const res = await fetch("http://localhost:1985/api/start");
        if (res.ok) {
            setCapturingPcap(true);
        }
    };

    useEffect(() => {
        listenPcapEventStream();
    }, []);

    useEffect(() => {
        if (!lockScroll) return;
        listRef.current?.scrollToItem(packets.length, "end");
    }, [packets]);

    useEffect(() => {
        if (!nameFilter && !jsonFilter) return;
        setFilteredPackets(
            packets
                .map((packet) => {
                    const result = packetFilter({
                        data: packet,
                        textFilter: nameFilter ?? "",
                        jsonFilter: jsonFilter ?? "",
                        orand: searchBoth
                    });
                    return result ? packet : undefined;
                })
                .filter((result) => result != undefined)
        );
    }, [packets, nameFilter, jsonFilter, searchBoth]);

    return (
        <div
            ref={bodyRef}
            id={"visualizer"}
            className={"w-full h-screen flex flex-row bg-[#333]"}
        >
            <div
                id={"visualizer-sidebar"}
                className={"flex flex-col justify-between bg-black-100"}
            >
                <div className="flex flex-col gap-2">
                    <Button
                        id={"visualizer-clear"}
                        className={
                            capturingPcap
                                ? "bg-red-800 hover:bg-red-900"
                                : "bg-green-800 hover:bg-green-900"
                        }
                        onClick={startPcap}
                        tooltip={"Start PCAP capture"}
                    >
                        {capturingPcap ? <IoMdPause /> : <IoMdPlay />}
                    </Button>

                    <Button
                        id={"visualizer-clear"}
                        className={"bg-aqua hover:brightness-150"}
                        onClick={onClickUploadPcap}
                        tooltip={"Upload PCAP"}
                    >
                        <IoMdCloudUpload />
                    </Button>

                    <Button
                        id={"visualizer-clear"}
                        className={"bg-aqua hover:brightness-150"}
                        onClick={onClickUploadProto}
                        tooltip={"Upload Proto"}
                    >
                        <IoMdBook />
                    </Button>

                    <Button
                        id={"visualizer-clear"}
                        className={"bg-aqua hover:brightness-150"}
                        onClick={onClickMessageSort}
                        tooltip={"Copy Sort Message"}
                    >
                        <IoIosRepeat />
                    </Button>
                </div>

                <Button
                    id={"visualizer-clear"}
                    className={"bg-red-800 hover:bg-red-900"}
                    onClick={() => {
                        clear(); // Clear the packet list.
                        setSelected(undefined); // Clear the selected packet.
                        setContent(undefined); // Clear the JSON content.
                    }}
                    tooltip={"Clear the packet list"}
                >
                    <IoMdClose />
                </Button>

                <div className={"flex flex-col-reverse gap-4"}>
                    <Button
                        id={"visualizer-save"}
                        className={"bg-aqua hover:brightness-150"}
                        onClick={() => {
                            const data = JSON.stringify(packets, null, 4);

                            const download = document.createElement("a");
                            download.href = URL.createObjectURL(
                                new Blob([data], { type: "application/json" })
                            );
                            download.download = "packets.json";
                            download.click();
                            download.remove();

                            console.log(
                                "Packets have been saved as 'packets.json'."
                            );
                        }}
                        tooltip={"Save all packets as a JSON file"}
                    >
                        <IoMdSave />
                    </Button>

                    <Button
                        id={"visualizer-load"}
                        className={"bg-aqua hover:brightness-150"}
                        onClick={() => {
                            const upload = document.createElement("input");
                            upload.type = "file";
                            upload.accept = ".json,.pcap";

                            upload.addEventListener("change", () => {
                                const file = upload.files?.[0];
                                if (!file) {
                                    console.error("No file selected.");
                                    upload.remove();
                                    return;
                                }

                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                    const contents = evt.target?.result;
                                    if (!contents) {
                                        console.error(
                                            "Failed to read file contents."
                                        );
                                        upload.remove();
                                        return;
                                    }

                                    if (typeof contents === "string") {
                                        // This is likely a JSON string.
                                        const data = JSON.parse(
                                            contents
                                        ) as PacketType[];

                                        // Clear the current packets.
                                        clear();
                                        setSelected(undefined);

                                        // Add the new packets.
                                        data.forEach(push);

                                        console.log(
                                            `Loaded ${data.length} packets!`
                                        );
                                    } else {
                                        alert(
                                            "Packet captures are not yet supported!"
                                        );
                                    }

                                    upload.remove();
                                };

                                // Check the file type.
                                if (file.name.endsWith(".json")) {
                                    reader.readAsText(file);
                                } else {
                                    reader.readAsArrayBuffer(file);
                                }
                            });

                            upload.click();
                        }}
                    >
                        <FaFileImport size={30} />
                    </Button>

                    <Button
                        id={"visualizer-scroll"}
                        className={classNames("bg-aqua hover:brightness-150", {
                            "bg-green-600": lockScroll
                        })}
                        onClick={() => setLockScroll(!lockScroll)}
                    >
                        <IoMdArrowDown />
                    </Button>
                </div>
            </div>

            <div
                id={"visualizer-content"}
                className={"flex flex-col flex-grow h-full bg-black-200"}
            >
                <div id={"visualizer-search"} className={"flex flex-row"}>
                    <input
                        placeholder={"🔍 Packet Name"}
                        className={"Visualizer_Input"}
                        onChange={({ target: { value } }) => {
                            const text = value.trim();
                            setNameFilter(text.length != 0 ? text : undefined);
                        }}
                    />

                    <div
                        className={"Visualizer_Mode"}
                        onClick={() => setSearchBoth(!searchBoth)}
                    >
                        <span
                            className={searchBoth ? "!bg-blue-400" : undefined}
                        >
                            and
                        </span>
                        <span
                            className={!searchBoth ? "!bg-blue-400" : undefined}
                        >
                            or
                        </span>
                    </div>

                    <input
                        placeholder={"🔍 Packet Data (JSON)"}
                        className={"Visualizer_Input"}
                        onChange={({ target: { value } }) => {
                            const text = value.trim();
                            setJsonFilter(text.length != 0 ? text : undefined);
                        }}
                    />
                </div>

                {jsonFilter || nameFilter ? (
                    <div
                        className={
                            "flex flex-col bg-black-900 border-b-white border-b-2"
                        }
                    >
                        <Labels />

                        <AutoSizer>
                            {({ width }) => (
                                <PacketList
                                    listRef={listRef}
                                    viewportHeight={viewportHeight}
                                    height={viewportHeight * 0.3} // 30% of the screen height.
                                    width={width}
                                    packets={filteredPackets}
                                    setSelected={setSelected}
                                    setContent={setContent}
                                    selected={selected}
                                    isFiltered={true}
                                    withPadding={false}
                                />
                            )}
                        </AutoSizer>

                        <div style={{ height: viewportHeight * 0.3 }} />
                    </div>
                ) : undefined}

                <Labels />

                <AutoSizer>
                    {({ height, width }) => (
                        <PacketList
                            listRef={listRef}
                            height={height}
                            viewportHeight={viewportHeight}
                            width={width}
                            packets={packets}
                            setSelected={setSelected}
                            setContent={setContent}
                            selected={selected}
                            withPadding={true}
                            filterShown={
                                jsonFilter != undefined ||
                                nameFilter != undefined
                            }
                        />
                    )}
                </AutoSizer>
            </div>

            <div
                id={"visualizer-resizer"}
                onMouseDown={() => {
                    if (!bodyRef.current) return;

                    bodyRef.current.style.userSelect = "none";
                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                }}
            />

            <PacketInspector
                width={editorWidth}
                packet={content as PacketType | undefined}
            />

            <Menu className={"!scale-90"} id={"visualizer-menu"} theme={"dark"}>
                <Item id={"copy"} onClick={copyPacket}>
                    Copy
                </Item>
                <Item id={"copy-raw"} onClick={copyPacket}>
                    Copy Binary Data
                </Item>
                <Separator />
                <Item id={"copy-name"} onClick={copyPacket}>
                    Copy Name
                </Item>
                <Item id={"copy-id"} onClick={copyPacket}>
                    Copy ID
                </Item>
                <Item id={"copy-header"} onClick={copyPacket}>
                    Copy as Header
                </Item>
            </Menu>
        </div>
    );
}

export default PacketVisualizer;
