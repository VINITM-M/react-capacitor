import { useMemo, useState, useRef, useEffect } from "react";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Table from "../components/Table";
import Modal from "../components/Modal";
import { exportData } from "../utils/exportUtils";
import { matchesSearch } from "../utils/searchUtils";
import { api } from "../api";
import { cleanKnownText, resolveStageCode } from "../utils/unknownUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

// ============================================================
// CONSTANTS
// ============================================================

const initialFilters = {
  minCapacity: "",
  maxCapacity: "",
  site: "All",
  moc: "All",
  agitator: "All",
  startDate: "",
  endDate: "",
};

const FALLBACK_STAGES = ["Unknown"];

const MAPPING_CATEGORIES = [
  "Confirmed",
  "High Probable",
  "Visible",
];

const initialMap = {
  product: "",
  customProduct: "",
  productCode: "",
  customProductCode: "",
  stage: "",
  stages: [],
  stageCode: "",
  category: "Confirmed",
  reactorUid: "",
  startDate: "",
  endDate: "",
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const categoryClass = (value) =>
  String(value || "Visible")
    .toLowerCase()
    .replace(/\s+/g, "-");

const normalizeStatus = (value) =>
  cleanKnownText(value).toLowerCase();

const normalizeId = (value) =>
  cleanKnownText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const datesOverlap = (startA, endA, startB, endB) => {
  if (!startA || !endA) return true;
  if (!startB || !endB) return false;

  return (
    new Date(startA) <= new Date(endB) &&
    new Date(startB) <= new Date(endA)
  );
};

const isAvailableStatus = (value) =>
  [
    "available",
    "available now",
    "physically available",
    "ready to map",
  ].includes(normalizeStatus(value));

const isMappedStatus = (value) =>
  ["mapped", "assigned", "reserved"].includes(
    normalizeStatus(value)
  );

const isMaintenanceStatus = (value) =>
  [
    "maintenance",
    "under maintenance",
    "under-maintenance",
  ].includes(normalizeStatus(value));

const fmtKL = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return "0 kL";

  return `${(number / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })} kL`;
};

const getMappingTimestamp = (mapping) => {
  const value =
    mapping?.createdAt ||
    mapping?.created_at ||
    mapping?.mappedAt ||
    mapping?.mapped_at ||
    mapping?.updatedAt ||
    mapping?.updated_at;

  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
};

const getMappingStages = (mapping) => resolveStageCode(mapping);

const getMappingDate = (value) => {
  if (!value) return "Unknown";
  return String(value);
};

// ============================================================
// AVAILABILITY COMPONENT
// ============================================================

// Compact searchable field: keeps long catalog lists hidden until the user types.
function SearchableMappingField({
  value,
  options,
  placeholder,
  onChange,
  getOptionLabel = (option) => String(option ?? ""),
  getOptionValue = (option) => String(option ?? ""),
  disabled = false,
  allowCustom = false,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selectedOption = options.find(
    (option) => getOptionValue(option) === String(value ?? "")
  );
  const selectedLabel = selectedOption ? getOptionLabel(selectedOption) : String(value || "");

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [selectedLabel]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        getOptionLabel(option).toLocaleLowerCase().includes(normalizedQuery) ||
        getOptionValue(option).toLocaleLowerCase().includes(normalizedQuery)
      ).slice(0, 100)
    : [];

  const chooseOption = (option) => {
    const nextValue = getOptionValue(option);
    onChange(nextValue);
    setQuery(getOptionLabel(option));
    setOpen(false);
  };

  return (
    <div className="mapping-searchable-field" ref={wrapperRef}>
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && normalizedQuery.length > 0}
        autoComplete="off"
        disabled={disabled}
        required
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          if (allowCustom) onChange(nextQuery);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setQuery(selectedLabel);
          }
          if (event.key === "Enter") {
            if (filteredOptions.length === 1) {
              event.preventDefault();
              chooseOption(filteredOptions[0]);
            } else if (allowCustom && query.trim()) {
              event.preventDefault();
              onChange(query.trim());
              setQuery(query.trim());
              setOpen(false);
            }
          }
        }}
        onBlur={() => {
          // Let a pointer selection complete before closing the result panel.
          window.setTimeout(() => {
            if (allowCustom && query.trim() && !selectedOption) {
              onChange(query.trim());
              setQuery(query.trim());
            } else {
              setQuery(selectedLabel);
            }
            setOpen(false);
          }, 120);
        }}
      />
      {open && normalizedQuery.length > 0 && (
        <div className="mapping-searchable-options" role="listbox">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const optionValue = getOptionValue(option);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={optionValue === String(value ?? "")}
                  className="mapping-searchable-option"
                  key={optionValue}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseOption(option)}
                >
                  {getOptionLabel(option)}
                </button>
              );
            })
          ) : (
            <div className="mapping-searchable-empty">No matching options</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Availability({
  equipment = [],
  mappings = [],
  mappingOptions = {},
  maintenance = [],
  globalSearch = "",
  results = [],
  onSearch,
  onCreateMapping,
  onUpdateMapping,
  onDeleteMapping,
}) {
  const resultsGridRef = useRef(null);
  const resultRef = useRef(null);

  const [showAllAvailable, setShowAllAvailable] = useState(false);

  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] =
    useState(initialFilters);

  const [mapForm, setMapForm] = useState(initialMap);
  const [mappingOpen, setMappingOpen] = useState(false);

  const [selected, setSelected] = useState(null);
  const [selectedReactors, setSelectedReactors] = useState([]);

  const [statusModal, setStatusModal] = useState("");
  const [busy, setBusy] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingMappingId, setEditingMappingId] = useState(null);

  const [successMessage, setSuccessMessage] = useState("");
  const [mappedSearch, setMappedSearch] = useState("");
  const [selectedMappingIds, setSelectedMappingIds] = useState([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [assistantReason, setAssistantReason] = useState("");
  const [assistantMode, setAssistantMode] = useState("idle");
  const [assistantError, setAssistantError] = useState("");

  // ==========================================================
  // SAFE DATA ARRAYS
  // ==========================================================

  const equipmentList = useMemo(
    () => (Array.isArray(equipment) ? equipment : []),
    [equipment]
  );

 const [localMappings, setLocalMappings] = useState(() =>
 Array.isArray(mappings) ? mappings : []
);
// Sync with mappings refreshed by the parent component
useEffect(() => {
 setLocalMappings(Array.isArray(mappings) ? mappings : []);
}, [mappings]);
const mappingList = useMemo(
 () => (Array.isArray(localMappings) ? localMappings : []),
 [localMappings]
);
const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipmentList, mappingList), [equipmentList, mappingList]);

  const catalog = useMemo(
    () =>
      Array.isArray(mappingOptions?.catalog)
        ? mappingOptions.catalog
        : [],
    [mappingOptions]
  );

  // ==========================================================
  // PRODUCT CODES
  // ==========================================================

  const productCodes = useMemo(() => {
    const apiCodes = Array.isArray(mappingOptions?.productCodes)
      ? mappingOptions.productCodes
      : [];

    const catalogCodes = catalog
      .map((item) => item?.code)
      .filter(Boolean);

    const existingCodes = mappingList
      .map(
        (mapping) =>
          mapping?.productCode || mapping?.product || ""
      )
      .filter(Boolean);

    const codes = apiCodes.length
      ? apiCodes
      : [...catalogCodes, ...existingCodes];

    return [
      ...new Set(codes.map((code) => String(code).trim())),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [mappingOptions, catalog, mappingList]);

  // ==========================================================
  // PRODUCT FAMILIES
  // ==========================================================

  const productFamilies = useMemo(() => {
    const apiProducts = Array.isArray(mappingOptions?.products)
      ? mappingOptions.products
      : [];

    if (apiProducts.length) return apiProducts;

    const groups = new Map();

    catalog.forEach((item) => {
      const product = String(
        item?.product || item?.code || ""
      ).trim();

      const code = String(item?.code || "").trim();

      if (!product || !code) return;

      if (!groups.has(product)) {
        groups.set(product, {
          product,
          codes: [],
          stages: [],
          codeCount: 0,
        });
      }

      const group = groups.get(product);

      if (!group.codes.includes(code)) {
        group.codes.push(code);
      }

      const stages = Array.isArray(item?.stages)
        ? item.stages
        : [];

      group.stages = [
        ...new Set([...group.stages, ...stages]),
      ];
    });

    if (!groups.size) {
      productCodes.forEach((code) => {
        groups.set(code, {
          product: code,
          codes: [code],
          stages: [],
          codeCount: 1,
        });
      });
    }

    return [...groups.values()].map((group) => ({
      ...group,
      codes: [...new Set(group.codes || [])],
      stages: [...new Set(group.stages || [])],
      codeCount:
        group.codeCount || group.codes?.length || 0,
    }));
  }, [mappingOptions, catalog, productCodes]);

  // ==========================================================
  // GLOBAL STAGE OPTIONS
  // ==========================================================

  const stageOptions = useMemo(() => {
    const apiStages = Array.isArray(mappingOptions?.stages)
      ? mappingOptions.stages
      : [];

    const catalogueStages = catalog.flatMap((item) =>
      Array.isArray(item?.stages) ? item.stages : []
    );

    const existingStages = mappingList.flatMap((mapping) => {
      if (
        Array.isArray(mapping?.stages) &&
        mapping.stages.length
      ) {
        return mapping.stages;
      }

      return mapping?.stage ? [mapping.stage] : [];
    });

    const stages = [
      ...apiStages,
      ...catalogueStages,
      ...existingStages,
    ]
      .map((stage) => String(stage || "").trim())
      .filter(Boolean);

    return stages.length
      ? [...new Set(stages)]
      : FALLBACK_STAGES;
  }, [mappingOptions, catalog, mappingList]);

  // ==========================================================
  // PRODUCT CODE OPTIONS FOR SELECTED PRODUCT
  // ==========================================================

  const availableProductCodes = useMemo(() => {
    const family = productFamilies.find(
      (item) =>
        String(item?.product || "") ===
        String(mapForm.product || "")
    );

    if (family?.codes?.length) {
      return [...new Set(family.codes)];
    }

    const catalogueCodes = catalog
      .filter(
        (item) =>
          String(item?.product || "") ===
          String(mapForm.product || "")
      )
      .map((item) => item.code)
      .filter(Boolean);

    if (catalogueCodes.length) {
      return [...new Set(catalogueCodes)];
    }

    return productCodes;
  }, [
    productFamilies,
    catalog,
    productCodes,
    mapForm.product,
  ]);

  // ==========================================================
  // STAGES FOR SELECTED PRODUCT CODE
  // ==========================================================

  const availableStageOptions = useMemo(() => {
    const selectedCode = String(
      mapForm.productCode || ""
    ).trim();

    const selectedProduct = String(
      mapForm.product || ""
    ).trim();

    const catalogItem = catalog.find(
      (item) =>
        String(item?.code || "").trim() === selectedCode
    );

    const productSpecificStages = catalogItem?.stagesByProduct?.[normalizeId(selectedProduct)] || [];
    if (productSpecificStages.length) {
      return [...new Set(productSpecificStages)];
    }
    if (catalogItem?.stages?.length) {
      return [...new Set(catalogItem.stages)];
    }

    const family = productFamilies.find(
      (item) =>
        String(item?.product || "") === selectedProduct
    );

    if (family?.stages?.length) {
      return [...new Set(family.stages)];
    }

    return stageOptions;
  }, [
    catalog,
    productFamilies,
    mapForm.product,
    mapForm.productCode,
    stageOptions,
  ]);

  // ==========================================================
  // FILTER DROPDOWN OPTIONS
  // ==========================================================

  const sites = useMemo(
    () =>
      [
        ...new Set(
          equipmentList
            .map((item) => item.site)
            .filter(Boolean)
        ),
      ].sort(),
    [equipmentList]
  );

  const canonicalMoc = (value) => {
    const raw = String(value ?? "").trim();
    const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
    const aliases = {
      hastolley: "Hastelloy",
      msglasslined: "MS Glass lined",
      msjacketedssreactors: "MS Jacketed SS Reactor",
      ss316: "SS316",
    };
    return aliases[key] || raw;
  };

  const canonicalAgitator = (value) => String(value ?? "").trim();

  const mocs = useMemo(() => {
    const values = equipmentList.map(item => canonicalMoc(item.moc)).filter(Boolean);
    return [...new Set(values)].sort((a,b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [equipmentList]);

  const agitators = useMemo(() => {
    const values = equipmentList.map(item => canonicalAgitator(item.agitator)).filter(Boolean);
    return [...new Set(values)].sort((a,b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [equipmentList]);

  // ==========================================================
  // MAPPED REACTOR LOOKUP
  // ==========================================================

  const mappingByReactor = useMemo(() => {
    const byUid = new Map();
    const byId = new Map();

    const orderedMappings = mappingList
      .map((mapping, index) => ({
        mapping,
        index,
        timestamp: getMappingTimestamp(mapping),
      }))
      .sort((a, b) => {
        if (
          a.timestamp != null &&
          b.timestamp != null &&
          a.timestamp !== b.timestamp
        ) {
          return a.timestamp - b.timestamp;
        }

        return a.index - b.index;
      });

    orderedMappings.forEach(({ mapping, index }) => {
      const entry = {
        ...mapping,
        _mappingOrder: index,
        _mappingTimestamp: getMappingTimestamp(mapping),
      };

      if (mapping?.reactorUid) {
        byUid.set(String(mapping.reactorUid), entry);
      }

      if (mapping?.reactorId) {
        byId.set(normalizeId(mapping.reactorId), entry);
      }
    });

    return { byUid, byId };
  }, [mappingList]);

  // ==========================================================
  // AVAILABLE REACTORS
  // ==========================================================

  const localResults = useMemo(() => {
    const q = String(globalSearch || "").trim().toLowerCase();
    const min = appliedFilters.minCapacity === "" ? null : Number(appliedFilters.minCapacity) * 1000;
    const max = appliedFilters.maxCapacity === "" ? null : Number(appliedFilters.maxCapacity) * 1000;
    const site = normalizeId(appliedFilters.site || "All");
    const moc = normalizeId(appliedFilters.moc || "All");
    const agitator = normalizeId(appliedFilters.agitator || "All");
    const selectedStart = appliedFilters.startDate || "";
    const selectedEnd = appliedFilters.endDate || "";
    const hasDateWindow = Boolean(selectedStart && selectedEnd);
    const todayIso = new Date().toISOString().slice(0, 10);
    const maintenanceStart = hasDateWindow ? selectedStart : todayIso;
    const maintenanceEnd = hasDateWindow ? selectedEnd : todayIso;
    const maintenanceRows = Array.isArray(maintenance) ? maintenance : [];

    const sameReactor = (record, item) => {
      const uid = String(item.uid || "");
      const id = normalizeId(item.id);
      return (uid && String(record?.reactorUid || "") === uid) ||
        (id && normalizeId(record?.reactorId || record?.reactor) === id);
    };

    const overlaps = (record, start, end) =>
      Boolean(record?.startDate && record?.endDate) && datesOverlap(record.startDate, record.endDate, start, end);

    return equipmentList.map(item => {
      const mappingConflicts = mappingList.filter(m =>
        sameReactor(m, item) && (!hasDateWindow || overlaps(m, selectedStart, selectedEnd))
      );
      const maintenanceConflicts = maintenanceRows.filter(m =>
        sameReactor(m, item) &&
        !["completed", "cancelled"].includes(normalizeStatus(m.status)) &&
        overlaps(m, maintenanceStart, maintenanceEnd)
      );

      const allMappings = mappingList
        .filter(m => sameReactor(m, item) && m.startDate && m.endDate)
        .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

      // A mapping only blocks a reactor for its actual date range. When no
      // planning window is selected, keep mapped reactors visible so the
      // operator can see when they become available again. They remain
      // non-selectable while the current mapping is active.
      if (hasDateWindow) {
        if (mappingConflicts.length || maintenanceConflicts.length) return null;

        return {
          ...item,
          _availableForRange: true,
          _availabilityLabel: `Available for ${selectedStart} → ${selectedEnd}`,
        };
      }

      // With no selected planning window, an active maintenance period still
      // keeps the reactor out of the available list. Mapped reactors, however,
      // stay visible with their actual release date.
      if (maintenanceConflicts.length) return null;

      const activeMapping = allMappings.find((m) =>
        datesOverlap(m.startDate, m.endDate, todayIso, todayIso)
      );
      const nextMapping = allMappings.find((m) => String(m.startDate).slice(0, 10) > todayIso);

      if (activeMapping) {
        const end = String(activeMapping.endDate).slice(0, 10);
        const availableFromDate = new Date(`${end}T00:00:00`);
        availableFromDate.setDate(availableFromDate.getDate() + 1);
        const availableFrom = availableFromDate.toISOString().slice(0, 10);
        return {
          ...item,
          _availableForRange: false,
          _availabilityLabel: `Currently mapped until ${end} · available from ${availableFrom}`,
        };
      }

      return {
        ...item,
        _availableForRange: true,
        _availabilityLabel: nextMapping
          ? `Available now · next mapping starts ${String(nextMapping.startDate).slice(0, 10)}`
          : "Available now",
      };
    }).filter(Boolean).filter(item => {
      const capacity = Number(item.capacity || 0);
      if (min !== null && Number.isFinite(min) && capacity < min) return false;
      if (max !== null && Number.isFinite(max) && capacity > max) return false;
      if (site !== "all" && normalizeId(item.site) !== site) return false;
      if (moc !== "all" && !normalizeId(canonicalMoc(item.moc)).includes(moc)) return false;
      if (agitator !== "all" && !normalizeId(item.agitator).includes(agitator)) return false;
      if (q) {
        const searchableText = Object.values(item).map(value => value == null ? "" : String(value)).join(" ").toLowerCase();
        if (!matchesSearch(searchableText, q)) return false;
      }
      return true;
    });
  }, [equipmentList, mappingList, maintenance, appliedFilters, globalSearch]);

  // FIX: Derive these only after localResults has been calculated.
  const displayedResults = showAllAvailable
    ? localResults
    : localResults.slice(0, 4);

  const remainingCount = Math.max(
    0,
    localResults.length - 4
  );

  // ==========================================================
  // FILTER HANDLERS
  // ==========================================================

  const setFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const setMap = (key, value) => {
    setMapForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  // ==========================================================
  // OPEN MAPPING MODAL
  // ==========================================================

  const openMapping = (reactor) => {
    setSelected(reactor);
    setSelectedReactors([]);
    setIsEditing(false);
    setEditingMappingId(null);

    setMapForm({
      ...initialMap,
      reactorUid: reactor.uid,
      startDate: appliedFilters.startDate || filters.startDate || "",
      endDate: appliedFilters.endDate || filters.endDate || "",
    });

    setMappingOpen(true);
  };

  const editMapping = (mapping, reactor) => {
    if (!mapping) {
      alert("No existing mapping found to edit.");
      return;
    }

    const reactorUid = mapping.reactorUid || reactor.uid;

    setSelectedReactors([]);

    const existingStages =
      Array.isArray(mapping.stages) && mapping.stages.length
        ? mapping.stages
        : mapping.stage
        ? [mapping.stage]
        : [];

    setSelected({
      ...reactor,
      uid: reactorUid,
    });

    setEditingMappingId(mapping.id);
    setIsEditing(true);

    setMapForm({
      ...initialMap,
      product: mapping.product || "",
      productCode: mapping.productCode || "",
      stage: existingStages[0] || "",
      stages: existingStages,
      stageCode: mapping.productCode || mapping.stageCode || "",
      category: mapping.category || "Confirmed",
      reactorUid,
      startDate: mapping.startDate || "",
      endDate: mapping.endDate || "",
    });

    setMappingOpen(true);
  };

  // ==========================================================
  // SUBMIT EQUIPMENT MAPPING
  // ==========================================================

  const submitMapping = async (event) => {
    event.preventDefault();

    const stages = Array.isArray(mapForm.stages)
      ? mapForm.stages
      : [];

    const selectedStage = String(
      mapForm.stage || ""
    ).trim();

    const finalStages = selectedStage
      ? [selectedStage]
      : stages;

    if (
      !selected ||
      !String(mapForm.product || "").trim() ||
      !String(mapForm.productCode || "").trim() ||
      !selectedStage ||
      !finalStages.length ||
      !MAPPING_CATEGORIES.includes(mapForm.category) ||
      !mapForm.reactorUid ||
      !mapForm.startDate ||
      !mapForm.endDate
    ) {
      alert(
        "Product Name, Stage Code, reactor, probability and date range are required."
      );
      return;
    }

    if (
      new Date(mapForm.startDate) >
      new Date(mapForm.endDate)
    ) {
      alert("Start date must be on or before end date.");
      return;
    }

    setBusy(true);
    setSuccessMessage("");

    try {
      const reactorsToMap = isEditing
        ? [selected]
        : selectedReactors.length
        ? selectedReactors
        : [selected];

      for (const reactor of reactorsToMap) {
 const payload = {
   ...mapForm,
   ...(isEditing ? { id: editingMappingId } : {}),
   reactorUid: String(
     reactor.uid || mapForm.reactorUid
   ),
   reactorId: reactor.id || "",
   stage: selectedStage,
   stages: [...finalStages],
 };
 let savedMapping;
 // Create or update the mapping
 if (isEditing) {
   if (!onUpdateMapping) {
     throw new Error(
       "Update mapping is not connected in the parent component."
     );
   }
   savedMapping = await onUpdateMapping(payload);
   if (savedMapping === false) {
     throw new Error(
       `Could not update mapping for ${
reactor.id || "selected reactor"
       }.`
     );
   }
 } else {
   if (!onCreateMapping) {
     throw new Error(
       "Create mapping is not connected in the parent component."
     );
   }
   savedMapping = await onCreateMapping(payload);
   if (savedMapping === false) {
     throw new Error(
       `Could not create mapping for ${
reactor.id || "selected reactor"
       }.`
     );
   }
 }
 // Prepare the mapping to display immediately
 const mappingToDisplay = {
   ...payload,
   ...(savedMapping && typeof savedMapping === "object"
     ? savedMapping
     : {}),
   createdAt:
     savedMapping?.createdAt ||
     savedMapping?.created_at ||
     payload.createdAt ||
     new Date().toISOString(),
   mappedAt:
     savedMapping?.mappedAt ||
     savedMapping?.mapped_at ||
     payload.mappedAt ||
     new Date().toISOString(),
   reactorUid: String(
     reactor.uid || mapForm.reactorUid
   ),
   reactorId:
reactor.id || payload.reactorId || "",
 };
 // Update the Mapped Reactors list
 setLocalMappings((current) => {
   const savedId = mappingToDisplay.id;
   // If this mapping already exists by ID, update it
   if (savedId != null) {
     const existingIndex = current.findIndex(
       (item) =>
         String(item.id) === String(savedId)
     );
     if (existingIndex !== -1) {
       return current.map((item, index) =>
         index === existingIndex
           ? {
               ...item,
               ...mappingToDisplay,
             }
           : item
       );
     }
   }
   // Check whether the same mapping already exists
   const alreadyExists = current.some((item) => {
     const sameReactor =
       String(item.reactorUid || "") ===
         mappingToDisplay.reactorUid ||
       (
         mappingToDisplay.reactorId &&
         String(
           item.reactorId || item.reactor || ""
         ) ===
           String(mappingToDisplay.reactorId)
       );
     const sameProduct =
       String(item.productCode || "") ===
       String(mappingToDisplay.productCode || "");
     const sameStartDate =
       String(item.startDate || "") ===
       String(mappingToDisplay.startDate || "");
     const sameEndDate =
       String(item.endDate || "") ===
       String(mappingToDisplay.endDate || "");
     return (
       sameReactor &&
       sameProduct &&
       sameStartDate &&
       sameEndDate
     );
   });
   // Do not add duplicate mappings
   if (alreadyExists) {
     return current;
   }
   // Add the latest mapping to the beginning of the list
   return [mappingToDisplay, ...current];
 });
}
// Refresh the available reactor results
await onSearch?.({
 ...filters,
 minCapacity:
   filters.minCapacity === ""
     ? ""
     : Number(filters.minCapacity) * 1000,
 maxCapacity:
   filters.maxCapacity === ""
     ? ""
     : Number(filters.maxCapacity) * 1000,
});

      setMappingOpen(false);
      setSelected(null);
      setSelectedReactors([]);
      setMapForm({ ...initialMap });
      setIsEditing(false);
      setEditingMappingId(null);

      setSuccessMessage(
        isEditing
          ? "Mapping updated successfully!"
          : `${reactorsToMap.length} reactor${
              reactorsToMap.length === 1 ? "" : "s"
            } mapped successfully!`
      );
    } catch (error) {
      alert(
        error?.message ||
          (isEditing
            ? "Could not update equipment mapping."
            : "Could not create equipment mapping.")
      );
    } finally {
      setBusy(false);
    }
  };

  // ==========================================================
  // BULK REACTOR SELECTION
  // ==========================================================

  const toggleReactorSelection = (reactor) => {
    setSelectedReactors((current) => {
      const reactorKey = String(
        reactor.uid || reactor.id
      );

      const exists = current.some(
        (item) =>
          String(item.uid || item.id) === reactorKey
      );

      const next = exists
        ? current.filter(
            (item) =>
              String(item.uid || item.id) !== reactorKey
          )
        : [...current, reactor];

      setSelected(next[0] || null);

      return next;
    });
  };

  const openBulkMapping = () => {
    if (!selectedReactors.length) {
      alert("Select one or more available reactors first.");
      return;
    }

    setSelected(selectedReactors[0]);

    setMapForm({
      ...initialMap,
      reactorUid: selectedReactors[0].uid || "",
    });

    setIsEditing(false);
    setEditingMappingId(null);
    setMappingOpen(true);
  };

  // ==========================================================
  // SCROLL TO RESULTS
  // ==========================================================

  const scrollToResults = () => {
    const target =
      resultRef.current ||
      resultsGridRef.current ||
      document.getElementById(
        "available-reactor-results"
      );

    if (!target) return;

    const rect = target.getBoundingClientRect();
    const absoluteTop =
      rect.top + window.scrollY - 20;

    window.scrollTo({
      top: Math.max(0, absoluteTop),
      behavior: "smooth",
    });
  };

  // ==========================================================
  // SEARCH AND RESET
  // ==========================================================

  const runSearch = () => {
    const nextFilters = { ...filters };

    setAppliedFilters(nextFilters);

    onSearch?.({
      ...nextFilters,
      minCapacity:
        nextFilters.minCapacity === ""
          ? ""
          : Number(nextFilters.minCapacity) * 1000,
      maxCapacity:
        nextFilters.maxCapacity === ""
          ? ""
          : Number(nextFilters.maxCapacity) * 1000,
    });

    setTimeout(scrollToResults, 250);
  };

  const reset = () => {
    setFilters({ ...initialFilters });
    setAppliedFilters({ ...initialFilters });

    onSearch?.({
      ...initialFilters,
      minCapacity: "",
      maxCapacity: "",
    });
  };

  // ==========================================================
  // PDF REPORT
  // ==========================================================

  const reportRows = localResults.map((reactor) => ({
    "Reactor ID": reactor.id || "",
    Site: reactor.site || "",
    Block: reactor.block || "",
    Area: reactor.area || "",
    Capacity: fmtKL(reactor.capacity),
    MOC: reactor.moc || "",
    Agitator: reactor.agitator || "",
    Status: reactor.status || "",
    "Mapped Project": reactor.projectMapped || "",
  }));

  const downloadReport = () => {
    exportData({
      rows: reportRows,
      format: "pdf",
      filename:
        `reactorplan-availability-report-` +
        new Date().toISOString().slice(0, 10),
      title:
        "ReactorPlan Availability & Equipment Mapping Report",
    });
  };

  // ==========================================================
  // MAPPED REACTORS
  // ==========================================================

  const mappedRows = useMemo(() => {
    return equipmentList
      .map((reactor) => {
        const uid = String(reactor.uid || "");
        const id = normalizeId(reactor.id);

        const activeMapping = uid
          ? (mappingByReactor.byUid.get(uid) || null)
          : (mappingByReactor.byId.get(id) || null);

        const reactorMappings = mappingList.filter((mapping) => {
          if (uid && mapping?.reactorUid) return String(mapping.reactorUid) === uid;
          if (mapping?.reactorUid && uid) return false;
          return normalizeId(mapping?.reactorId) === id
            && (!mapping?.site || normalizeId(mapping.site) === normalizeId(reactor.site))
            && (!mapping?.block || normalizeId(mapping.block) === normalizeId(reactor.block))
            && (!mapping?.area || normalizeId(mapping.area) === normalizeId(reactor.area));
        });

        const mappingSearchText = reactorMappings
          .map((mapping) => ({
            product: mapping?.product,
            productCode: mapping?.productCode,
            stage: mapping?.stage,
            stages: mapping?.stages,
            stageCode: mapping?.stageCode,
            category: mapping?.category,
            startDate: mapping?.startDate,
            endDate: mapping?.endDate,
          }));

        return {
          ...reactor,
          activeMapping,
          hasMapping: Boolean(activeMapping),
          mappingTimestamp:
            activeMapping?._mappingTimestamp ?? null,
          mappingOrder:
            activeMapping?._mappingOrder ?? -1,
          _mappedSearchText: {
            reactorId: reactor.id,
            equipmentUid: reactor.uid,
            site: reactor.site,
            block: reactor.block,
            area: reactor.area,
            projectMapped: reactor.projectMapped,
            sourceProjectMapped: reactor.sourceProjectMapped,
            product: activeMapping?.product,
            productCode: activeMapping?.productCode,
            stage: activeMapping?.stage,
            stages: activeMapping?.stages,
            stageCode: activeMapping?.stageCode,
            mappings: mappingSearchText,
          },
        };
      })
      // This table is the workbook schedule mapping register, not the
      // physical inventory status register. Only include actual tracker links.
      .filter((reactor) => reactor.hasMapping)
      .sort((a, b) => {
        if (
          a.mappingTimestamp != null &&
          b.mappingTimestamp != null &&
          a.mappingTimestamp !== b.mappingTimestamp
        ) {
          return b.mappingTimestamp - a.mappingTimestamp;
        }

        if (a.mappingOrder !== b.mappingOrder) {
          return b.mappingOrder - a.mappingOrder;
        }

        if (a.hasMapping !== b.hasMapping) {
          return a.hasMapping ? -1 : 1;
        }

        return (
          String(a.site || "").localeCompare(
            String(b.site || "")
          ) ||
          String(a.id || "").localeCompare(
            String(b.id || "")
          )
        );
      })
      // Keep physical equipment records distinct by stable UID. Reactor IDs
      // can repeat across sites/areas, so de-duplicate by UID, not visible ID.
      .filter((reactor, index, rows) => rows.findIndex(candidate => {
        const candidateUid = String(candidate.uid || "").trim();
        const currentUid = String(reactor.uid || "").trim();
        if (candidateUid || currentUid) return candidateUid === currentUid;
        return normalizeId(candidate.id) === normalizeId(reactor.id)
          && normalizeId(candidate.site) === normalizeId(reactor.site)
          && normalizeId(candidate.block) === normalizeId(reactor.block)
          && normalizeId(candidate.area) === normalizeId(reactor.area);
      }) === index);
  }, [equipmentList, mappingByReactor]);

  // ==========================================================
  // DASHBOARD COUNTS
  // ==========================================================

  // ==========================================================
  // MAPPED REACTOR SEARCH
  // Searches the reactor itself plus ALL historical/current mappings
  // so older mappings remain discoverable even when the user no
  // longer remembers the reactor ID.
  // Supported fields: product, product code, stage, stage code,
  // reactor ID, equipment UID, site, block and project-mapped value.
  // ==========================================================

  const filteredMappedRows = useMemo(() => {
    const query = String(mappedSearch || "").trim();
    if (!query) return mappedRows;

    return mappedRows.filter((reactor) =>
      matchesSearch(reactor._mappedSearchText || reactor, query)
    );
  }, [mappedRows, mappedSearch]);

  const toggleMappingSelection = (mappingId, checked) => {
    if (mappingId == null) return;
    const id = String(mappingId);
    setSelectedMappingIds(current => checked
      ? (current.includes(id) ? current : [...current, id])
      : current.filter(value => value !== id));
  };

  const selectAllVisibleMappings = checked => {
    const ids = filteredMappedRows.map(row => row.activeMapping?.id).filter(id => id != null).map(String);
    setSelectedMappingIds(current => checked
      ? [...new Set([...current, ...ids])]
      : current.filter(id => !ids.includes(id)));
  };

  const saveBulkMappingChanges = async () => {
    if (!selectedMappingIds.length) return alert("Select at least one mapped reactor first.");
    if (!bulkStartDate && !bulkEndDate && !bulkCategory) return alert("Choose at least one field to update.");
    if (bulkStartDate && bulkEndDate && new Date(bulkStartDate) > new Date(bulkEndDate)) return alert("Start date must be on or before end date.");
    if (!onUpdateMapping) return alert("Update mapping is not connected in the parent component.");
    const chosen = mappedRows.map(row => row.activeMapping).filter(mapping => mapping && selectedMappingIds.includes(String(mapping.id)));
    if (!chosen.length) return alert("The selected mapping records could not be found. Refresh the page and select them again.");
    setBusy(true);
    try {
      for (const mapping of chosen) {
        const payload = {
          ...mapping,
          ...(bulkStartDate ? { startDate: bulkStartDate } : {}),
          ...(bulkEndDate ? { endDate: bulkEndDate } : {}),
          ...(bulkCategory ? { category: bulkCategory } : {}),
        };
        if (payload.startDate && payload.endDate && new Date(payload.startDate) > new Date(payload.endDate)) {
          throw new Error(`The date range for reactor ${mapping.reactorId || mapping.reactorUid || "selected"} would be invalid.`);
        }
        const result = await onUpdateMapping(payload);
        if (result === false) throw new Error(`Could not update mapping ${mapping.id}.`);
      }
      setSelectedMappingIds([]);
      setBulkEditOpen(false);
      setBulkStartDate(""); setBulkEndDate(""); setBulkCategory("");
      setSuccessMessage(`Updated ${chosen.length} mapping${chosen.length === 1 ? "" : "s"}.`);
    } catch (error) {
      alert(error?.message || "Some mappings could not be updated. Check the records and try again.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    available: inventoryMetrics.counts.Available,
    mapped: inventoryMetrics.counts.Mapped,
    maintenance: inventoryMetrics.counts.Maintenance,
  }), [inventoryMetrics]);

  // ==========================================================
  // RECOMMENDED REACTOR
  // ==========================================================

  const recommended = useMemo(() => {
    if (!localResults.length) return null;

    const target =
      filters.minCapacity !== ""
        ? Number(filters.minCapacity) * 1000
        : 0;

    return [...localResults].sort((a, b) => {
      const ac = Number(a.capacity || 0);
      const bc = Number(b.capacity || 0);

      const ad = target ? Math.abs(ac - target) : ac;
      const bd = target ? Math.abs(bc - target) : bc;

      return (
        ad - bd ||
        String(a.site || "").localeCompare(
          String(b.site || "")
        ) ||
        String(a.id || "").localeCompare(
          String(b.id || "")
        )
      );
    })[0];
  }, [localResults, filters.minCapacity]);

  useEffect(() => {
    let active = true;
    if (!recommended) {
      setAssistantReason(""); setAssistantMode("idle"); setAssistantError("");
      return () => { active = false; };
    }
    setAssistantMode("loading"); setAssistantError("");
    api.assistantRecommendation({
      candidate: { id:recommended.id, uid:recommended.uid, site:recommended.site, block:recommended.block, area:recommended.area, capacity:recommended.capacity, moc:recommended.moc, agitator:recommended.agitator, status:recommended.status, projectMapped:recommended.projectMapped },
      filters: { minCapacity:filters.minCapacity, maxCapacity:filters.maxCapacity, site:filters.site, moc:filters.moc, agitator:filters.agitator, startDate:filters.startDate, endDate:filters.endDate },
      candidateCount: localResults.length,
    }).then(result => {
      if (!active) return;
      setAssistantReason(result.explanation || "The selected reactor is the closest capacity match among the results that passed your filters.");
      setAssistantMode(result.mode || "rule-based"); setAssistantError(result.modelMessage || "");
    }).catch(() => {
      if (!active) return;
      setAssistantReason("This reactor is a capacity-efficient option among the results that passed your filters. The explanation is based on the source inventory and selected requirements.");
      setAssistantMode("rule-based"); setAssistantError("Local LLM unavailable; using the grounded rule-based explanation.");
    });
    return () => { active = false; };
  }, [recommended?.uid, recommended?.id, recommended?.capacity, filters.minCapacity, filters.maxCapacity, filters.site, filters.moc, filters.agitator, filters.startDate, filters.endDate, localResults.length]);

  // ==========================================================
  // RECENT MAPPINGS
  // ==========================================================

  const recentMappings = useMemo(() => {
    return mappingList
      .map((mapping, index) => ({
        mapping,
        index,
        timestamp: getMappingTimestamp(mapping),
      }))
      .sort((a, b) => {
        // New mappings are inserted at the beginning of localMappings.
        // Prefer a real timestamp, then preserve that newest-first order
        // when timestamps are missing or identical.
        if (
          a.timestamp != null &&
          b.timestamp != null &&
          a.timestamp !== b.timestamp
        ) {
          return b.timestamp - a.timestamp;
        }

        return a.index - b.index;
      })
      .slice(0, 10)
      .map(({ mapping }) => mapping);
  }, [mappingList]);

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <section className="workspace-page">
      <PageHeader
        title="Availability & Equipment Mapping"
        subtitle="Check capacity first, then map the selected reactor to a manufacturing campaign without leaving this workspace."
        action={
          <button
            type="button"
            className="secondary"
            onClick={downloadReport}
          >
            Download Report
          </button>
        }
      />

      {/* SUCCESS NOTIFICATION */}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mapping-success-toast"
        >
          <span className="mapping-success-icon">✓</span>

          <div>
            <strong>Mapping successful</strong>
            <p>{successMessage}</p>
          </div>

          <button
            type="button"
            aria-label="Close notification"
            onClick={() => setSuccessMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {/* DASHBOARD COUNTS */}

      <div className="stats-grid compact workspace-stats">
        <StatCard
          label="Available Reactors"
          value={counts.available}
          hint="Physical inventory without a planning assignment"
          onClick={() => setStatusModal("Available")}
        />

        <StatCard
          label="Mapped Reactors"
          value={counts.mapped}
          hint="Physical inventory records with at least one planning assignment"
          onClick={() => setStatusModal("Mapped")}
        />

        <StatCard
          label="Maintenance Reactors"
          value={counts.maintenance}
          hint="Click to view maintenance reactors"
          onClick={() => setStatusModal("Maintenance")}
        />
      </div>
      <p className="availability-count-note" role="note">
        Inventory reconciliation: {counts.mapped.toLocaleString()} mapped + {counts.available.toLocaleString()} available + {counts.maintenance.toLocaleString()} under maintenance = {equipmentList.length.toLocaleString()} Total Reactors. Date-specific planning availability is calculated separately for the selected period.
      </p>

      {/* WORKSPACE STEPPER */}

      <div className="panel workspace-stepper">
        <div className="workspace-step active">
          <b>1</b>
          <div>
            <strong>Check availability</strong>
            <span>Filter and compare reactors.</span>
          </div>
        </div>

        <div className="workspace-step-arrow">→</div>

        <div
          className={`workspace-step ${
            selected ? "active" : ""
          }`}
        >
          <b>2</b>
          <div>
            <strong>Select reactor</strong>
            <span>
              {selected
                ? `${selected.id} selected`
                : "Choose a reactor from the results"}
            </span>
          </div>
        </div>

        <div className="workspace-step-arrow">→</div>

        <div
          className={`workspace-step ${
            mappingOpen ? "active" : ""
          }`}
        >
          <b>3</b>
          <div>
            <strong>Map equipment</strong>
            <span>Product Name, Stage Code, and dates</span>
          </div>
        </div>
      </div>

      {/* COMPACT AVAILABILITY FILTERS */}

      <div className="panel availability-filter-panel compact-availability">
        <div className="compact-availability-header">
          <div>
            

            <h2>Check reactor availability</h2>

            <p className="muted">
              Set your requirements and find suitable reactors.
            </p>
          </div>

          
        </div>

        {/* CAPACITY */}

        <div className="compact-filter-group">
          <label className="availability-field">
            <span>Minimum capacity (kL)</span>

            <input
              type="number"
              min="0"
              step="any"
              placeholder="Min. capacity"
              value={filters.minCapacity}
              onChange={(event) =>
                setFilter("minCapacity", event.target.value)
              }
            />
          </label>

          <label className="availability-field">
            <span>Maximum capacity (kL)</span>

            <input
              type="number"
              min="0"
              step="any"
              placeholder="Max. capacity"
              value={filters.maxCapacity}
              onChange={(event) =>
                setFilter("maxCapacity", event.target.value)
              }
            />
          </label>
        </div>

        {/* EQUIPMENT SPECIFICATIONS */}

        <div className="compact-filter-group">
          <label className="availability-field">
            <span>Site</span>

            <select
              value={filters.site}
              onChange={(event) =>
                setFilter("site", event.target.value)
              }
            >
              <option value="All">All sites</option>

              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </label>

          <label className="availability-field">
            <span>Material of construction</span>

            <select
              value={filters.moc}
              onChange={(event) =>
                setFilter("moc", event.target.value)
              }
            >
              <option value="All">All MOC types</option>

              {mocs.map((moc) => (
                <option key={moc} value={moc}>
                  {moc}
                </option>
              ))}
            </select>
          </label>

          <label className="availability-field">
            <span>Agitator</span>

            <select
              value={filters.agitator}
              onChange={(event) =>
                setFilter("agitator", event.target.value)
              }
            >
              <option value="All">All agitators</option>

              {agitators.map((agitator) => (
                <option key={agitator} value={agitator}>
                  {agitator}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* PLANNING DATES */}

        <div className="compact-filter-group compact-date-group">
          <label className="availability-field">
            <span>Start date</span>

            <input
              type="date"
              value={filters.startDate}
              max={filters.endDate || undefined}
              onChange={(event) =>
                setFilter("startDate", event.target.value)
              }
            />
          </label>

          <label className="availability-field">
            <span>End date</span>

            <input
              type="date"
              value={filters.endDate}
              min={filters.startDate || undefined}
              onChange={(event) =>
                setFilter("endDate", event.target.value)
              }
            />
          </label>

          <div className="compact-date-hint">
            <span aria-hidden="true">ⓘ</span>
            <span>
              Optional: select both dates to check availability during a specific planning period.
              A reactor mapped for another period can still be selected and mapped again when the new dates do not overlap.
            </span>
          </div>
        </div>

        {/* SEARCH ACTIONS */}

        <div className="compact-filter-footer">
          <span className="compact-filter-summary">
            <strong>{localResults.length.toLocaleString()}</strong>
            <span>reactors found</span>
          </span>

          <div className="compact-filter-actions">
            <button
              type="button"
              className="secondary"
              onClick={reset}
              disabled={busy}
            >
              Reset
            </button>

            <button
              type="button"
              className="availability-search-btn"
              onClick={runSearch}
              disabled={busy}
            >
              Search reactors
            </button>
          </div>
        </div>
      </div>

      {/* RECOMMENDATION */}

      {recommended && (
        <div className="panel recommendation-panel">
          <div>
            <span className="eyebrow">Open-source AI planning assistant</span>
            <h2>Recommended match: {recommended.id}</h2>
            <p className="assistant-explanation">{assistantMode === "loading" ? "Checking the selected reactor against your filters and preparing the match explanation…" : assistantReason}</p>
            <p className="assistant-model-status">{assistantMode === "ollama" ? "Explanation provided by local Ollama / Qwen 2.5 open-source model." : assistantMode === "loading" ? "Open-source model status: checking…" : "Grounded rule-based explanation active; start Ollama to enable the local LLM explanation."}{assistantError ? ` ${assistantError}` : ""}</p>
          </div>

          <div className="recommendation-facts">
            <span>{recommended.site || "Unknown"}</span>
            <span>{fmtKL(recommended.capacity)}</span>
            <span>
              {recommended.moc || "MOC Not Available"}
            </span>

            <button
              type="button"
              onClick={() => openMapping(recommended)}
            >
              Map this reactor
            </button>
          </div>
        </div>
      )}

      {/* AVAILABLE REACTOR RESULTS */}

      <div
        ref={resultRef}
        id="available-reactor-results"
        className="workspace-results-grid"
      >
        <div className="panel">
          <div className="panel-title-row">
            <div>
              <h2>Available reactor results</h2>
              <p className="muted">
                Available reactors matching your selected filters.
              </p>
            </div>

            <span className="result-count">
              {localResults.length} results
            </span>
          </div>

          <div className="bulk-selection-toolbar">
            <span>
              {selectedReactors.length} reactor
              {selectedReactors.length === 1 ? "" : "s"} selected
            </span>

            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSelectedReactors([]);
                  setSelected(null);
                }}
              >
                Clear selection
              </button>

              <button
                type="button"
                disabled={!selectedReactors.length || busy}
                onClick={openBulkMapping}
              >
                Map selected ({selectedReactors.length})
              </button>
            </div>
          </div>

          <div
            className="reactor-results workspace-reactor-results"
            ref={resultsGridRef}
          >
            {displayedResults.map((reactor) => (
              <div
                key={
                  reactor.uid ||
                  `${reactor.id}-${reactor.site}`
                }
                className={`reactor-card workspace-reactor-card ${
                  selected?.uid === reactor.uid
                    ? "selected"
                    : ""
                }`}
              >
                <div className="card-top">
                  <label className="reactor-select-check">
                    <input
                      type="checkbox"
                      checked={selectedReactors.some(
                        (item) =>
                          String(item.uid || item.id) ===
                          String(reactor.uid || reactor.id)
                      )}
                      onChange={() =>
                        toggleReactorSelection(reactor)
                      }
                      aria-label={`Select reactor ${reactor.id}`}
                    />
                    Select
                  </label>

                  <span className={`badge ${reactor._availableForRange === false ? "category-high-probable" : "available"}`}>
                    {reactor._availableForRange === false ? "Currently mapped · future periods available" : "Available"}
                  </span>

                  <strong
                    className={`site-label site-${String(
                      reactor.site || ""
                    )
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    {reactor.site || "Unknown"}
                  </strong>
                </div>

                <h3>{reactor.id || "Unknown"}</h3>

                <div className="reactor-meta-grid">
                  <span>
                    Capacity
                    <strong>{fmtKL(reactor.capacity)}</strong>
                  </span>

                  <span>
                    MOC
                    <strong>{reactor.moc || "Unknown"}</strong>
                  </span>

                  <span>
                    Agitator
                    <strong>{reactor.agitator || "Unknown"}</strong>
                  </span>

                  <span>
                    Block
                    <strong>
                      {reactor.block || "Unknown"}
                    </strong>
                  </span>
                </div>

                <div className="availability-window-note">
                  {reactor._availabilityLabel || "Available for selected period"}
                </div>

                <div className="reactor-card-actions">
                  <button
                    type="button"
                    disabled={false}
                    title={
                      reactor._availableForRange === false
                        ? "This reactor is mapped for the current period. Select a different non-overlapping date range to map it again."
                        : "Map equipment"
                    }
                    onClick={() => openMapping(reactor)}
                  >
                    {reactor._availableForRange === false
                      ? "Map for another period"
                      : "Map equipment"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* VIEW MORE AVAILABLE REACTORS */}

          {localResults.length > 4 && (
            <div className="available-results-footer">
              <button
                type="button"
                className="view-more-reactors-btn"
                onClick={() =>
                  setShowAllAvailable((current) => !current)
                }
                aria-expanded={showAllAvailable}
                aria-controls="available-reactor-results-list"
              >
                {showAllAvailable
                  ? "Show less"
                  : `View more (${remainingCount} remaining)`}

                <span
                  className={`view-more-chevron ${
                    showAllAvailable ? "expanded" : ""
                  }`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
            </div>
          )}

          {!localResults.length && (
            <div className="empty-panel">
              No available reactors match these criteria.
            </div>
          )}
        </div>

        {/* MAPPED REACTORS TABLE */}

        <div className="panel mapped-reactors-panel">
          <div className="panel-title-row">
            <div>
              <h2>Mapped reactors</h2>
              <p className="muted">
                Newly mapped reactors appear first. Existing
                mappings remain visible here.
              </p>
            </div>

            <span className="result-count">
              {mappedSearch.trim()
                ? `${filteredMappedRows.length} of ${mappedRows.length} mapped`
                : `${mappedRows.length} mapped`}
            </span>
          </div>

          <div className="mapped-reactor-search-row">
            <label className="mapped-reactor-search-field">
              <span>Search mapped reactors</span>
              <input
                type="search"
                value={mappedSearch}
                onChange={(event) => setMappedSearch(event.target.value)}
                placeholder="Search Product Name, Stage Code or Reactor ID"
                aria-label="Search mapped reactors by Product Name, Stage Code or Reactor ID"
              />
            </label>
            {mappedSearch.trim() && (
              <button
                type="button"
                className="secondary mapped-search-clear"
                onClick={() => setMappedSearch("")}
              >
                Clear
              </button>
            )}
          </div>

          <div className="bulk-mapping-toolbar">
            <label className="bulk-select-all"><input type="checkbox" checked={filteredMappedRows.filter(row=>row.activeMapping?.id!=null).length>0 && filteredMappedRows.filter(row=>row.activeMapping?.id!=null).every(row=>selectedMappingIds.includes(String(row.activeMapping.id)))} onChange={e=>selectAllVisibleMappings(e.target.checked)} /> Select all visible</label>
            <span>{selectedMappingIds.length} selected</span>
            <button type="button" className="secondary" disabled={!selectedMappingIds.length || busy} onClick={()=>setBulkEditOpen(value=>!value)}>{bulkEditOpen ? "Close bulk edit" : "Edit selected dates / probability"}</button>
          </div>
          {bulkEditOpen && <div className="bulk-mapping-editor">
            <div><label>New start date <span className="muted">(leave blank to keep current)</span></label><input type="date" value={bulkStartDate} onChange={e=>setBulkStartDate(e.target.value)} /></div>
            <div><label>New end date <span className="muted">(leave blank to keep current)</span></label><input type="date" min={bulkStartDate || undefined} value={bulkEndDate} onChange={e=>setBulkEndDate(e.target.value)} /></div>
            <div><label>Probability <span className="muted">(optional)</span></label><select value={bulkCategory} onChange={e=>setBulkCategory(e.target.value)}><option value="">Keep current</option>{MAPPING_CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}</select></div>
            <div className="modal-actions"><button type="button" className="secondary" onClick={()=>{setBulkStartDate("");setBulkEndDate("");setBulkCategory("");setBulkEditOpen(false);}}>Cancel</button><button type="button" onClick={saveBulkMappingChanges} disabled={busy || !selectedMappingIds.length}>{busy ? "Saving…" : `Save changes to ${selectedMappingIds.length} selected`}</button></div>
          </div>}

          {filteredMappedRows.length > 0 ? (
            <div className="mapped-reactor-table-wrap">
              <table className="mapped-reactor-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Reactor ID</th>
                    <th>Site</th>
                    <th>Capacity</th>
                    <th>Current mapping</th>
                    <th>Stage Code</th>
                    <th>Probability</th>
                    <th>Dates</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredMappedRows.map((reactor) => {
                    const mapping = reactor.activeMapping;

                    return (
                      <tr key={reactor.uid || reactor.id}>
                        <td><input type="checkbox" aria-label={`Select mapping for reactor ${reactor.id || ""}`} checked={mapping?.id != null && selectedMappingIds.includes(String(mapping.id))} disabled={mapping?.id == null || busy} onChange={event=>toggleMappingSelection(mapping.id,event.target.checked)} /></td>
                        <td>
                          <strong>{reactor.id || "Unknown"}</strong>
                          <div className="muted small-text">
                            {reactor.uid || ""}
                          </div>
                        </td>

                        <td>{reactor.site || "Unknown"}</td>
                        <td>{fmtKL(reactor.capacity)}</td>

                        <td>
                          <strong>{cleanKnownText(mapping?.product) || "Unknown"}</strong>
                        </td>

                        <td>{getMappingStages(mapping)}</td>

                        <td>
                          <span
                            className={`badge category-${categoryClass(
                              mapping?.category || "Confirmed"
                            )}`}
                          >
                            {mapping?.category || "Confirmed"}
                          </span>
                        </td>

                        <td>
                          {mapping
                            ? `${getMappingDate(
                                mapping.startDate
                              )} → ${getMappingDate(
                                mapping.endDate
                              )}`
                            : "Unknown"}
                        </td>

                        <td>
                          {mapping ? (
                            <div className="mapped-row-actions">
                              <button
                                type="button"
                                className="secondary mapped-edit-button"
                                onClick={() =>
                                  editMapping(mapping, reactor)
                                }
                                disabled={busy}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="danger mapped-delete-button"
                                onClick={() =>
                                  onDeleteMapping?.(mapping.id)
                                }
                                disabled={busy}
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <span className="muted small-text">
                              No active mapping
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel compact-empty">
              {mappedSearch.trim()
                ? `No mapped reactors match “${mappedSearch.trim()}”. Try a Product Name, Stage Code or Reactor ID.`
                : "No mapped reactors."}
            </div>
          )}
        </div>

        {/* MAPPING QUEUE */}

        <div className="panel mapping-queue-panel">
          <div className="panel-title-row">
            <div>
              <h2>2. Equipment mapping queue</h2>
              <p className="muted">
                Select a reactor above to continue.
              </p>
            </div>
          </div>

          {selected ? (
            <div className="selected-reactor-summary">
              <span className="eyebrow">Mapping queue</span>
              <strong>{selectedReactors.length > 1 ? `${selectedReactors.length} reactors selected` : selected.id}</strong>
              {selectedReactors.length > 1 ? (
                <div className="mapping-queue-selected-list">
                  {selectedReactors.map(reactor => (
                    <div key={reactor.uid || reactor.id}>
                      <b>{reactor.id}</b>
                      <span>{reactor.site || "Unknown"} · {fmtKL(reactor.capacity)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span>{selected.site || "Unknown"} · {fmtKL(selected.capacity)} · {selected.uid || "Unknown"}</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => selectedReactors.length > 1 ? openBulkMapping() : openMapping(selected)}
              >
                {selectedReactors.length > 1 ? `Continue with ${selectedReactors.length} selected` : "Continue to mapping"}
              </button>
            </div>
          ) : (
            <div className="empty-panel compact-empty">
              Select a reactor using its checkbox in Available reactor results. Your selection will appear here.
            </div>
          )}

          <div className="mapping-status-legend">
            <span className="legend confirmed">Confirmed</span>
            <span className="legend high-probable">
              High Probable
            </span>
            <span className="legend visible">Visible</span>
            <span className="legend maintenance">
              Maintenance
            </span>
          </div>
        </div>
      </div>

      {/* RECENT EQUIPMENT MAPPINGS */}

      <div className="panel recent-mappings-panel">
        <div className="panel-title-row">
          <div>
            <h2>Recent equipment mappings</h2>
            <p className="muted">
              Mapped reactor IDs remain searchable across the
              entire application.
            </p>
          </div>

          <span className="result-count">
            {mappingList.length} total mappings
          </span>
        </div>

        <Table
          rows={recentMappings}
          columns={[
            {
              key: "reactorId",
              label: "Reactor ID",
              render: (row) => (
                <strong>
                  {row.reactorId || row.reactorUid || "Unknown"}
                </strong>
              ),
            },
            { key: "product", label: "Product Name" },
            { key: "stageCode", label: "Stage Code", render: row => getMappingStages(row) },
            {
              key: "category",
              label: "Probability",
              render: (row) => (
                <span
                  className={`badge category-${categoryClass(
                    row.category
                  )}`}
                >
                  {row.category || "Confirmed"}
                </span>
              ),
            },
            { key: "startDate", label: "Start" },
            { key: "endDate", label: "End" },
          ]}
        />
      </div>

      

      {/* EQUIPMENT MAPPING MODAL */}

      {mappingOpen && selected && (
        <Modal
          className="mapping-modal-card"
          title={`${
            isEditing ? "Edit Mapping" : "Map Equipment"
          } — ${
            selectedReactors.length > 1
              ? `${selectedReactors.length} reactors`
              : selected.id
          }`}
          onClose={() => {
            if (!busy) {
              setMappingOpen(false);
              setIsEditing(false);
              setEditingMappingId(null);
            }
          }}
        >
          <form onSubmit={submitMapping}>
            <div className="selected-modal-reactor">
              <strong>{selected.id}</strong>

              <span>
                {selected.site || "Unknown"} ·{" "}
                {fmtKL(selected.capacity)} ·{" "}
                {selected.moc || "MOC Not Available"}
              </span>
            </div>

            {selectedReactors.length > 1 && (
              <p className="muted bulk-map-note">
                This mapping will be created for{" "}
                {selectedReactors.length} selected reactors.
              </p>
            )}

            <div className="form-grid mapping-form-grid">
              {/* PRODUCT */}

              <label>
                Product Name

                <SearchableMappingField
                  value={mapForm.product}
                  placeholder="Search or select Product Name"
                  options={productFamilies}
                  allowCustom
                  getOptionValue={(item) => String(item?.product || "")}
                  getOptionLabel={(item) => `${item.product} · ${item.codeCount || item.codes?.length || 0} codes`}
                  onChange={(value) => {
                    const family = productFamilies.find(
                      (item) => String(item?.product || "") === value
                    );
                    if (!family) {
                      setMapForm((current) => ({
                        ...current,
                        product: value,
                        productCode: "",
                        stageCode: "",
                        stage: "",
                        stages: [],
                      }));
                      return;
                    }
                    const firstCode = family.codes?.[0] || "";
                    const catalogItem = catalog.find(
                      (item) => String(item?.code || "") === firstCode
                    );
                    const productSpecificStages = catalogItem?.stagesByProduct?.[normalizeId(value)] || [];
                    const nextStages = productSpecificStages.length
                      ? productSpecificStages
                      : catalogItem?.stages?.length
                      ? catalogItem.stages
                      : family?.stages?.length
                      ? family.stages
                      : stageOptions;
                    const firstStage = nextStages[0] || "";
                    setMapForm((current) => ({
                      ...current,
                      product: value,
                      productCode: firstCode,
                      stageCode: firstCode,
                      stage: firstStage,
                      stages: firstStage ? [firstStage] : [],
                    }));
                  }}
                />
              </label>

              <label>
                Stage Code
                <SearchableMappingField
                  value={mapForm.productCode || mapForm.stageCode || ""}
                  placeholder="Search or enter a Stage Code"
                  options={[...new Set(availableProductCodes.filter(Boolean))].sort((a, b) => a.localeCompare(b))}
                  allowCustom
                  onChange={(code) => {
                    const item = catalog.find(catalogItem => String(catalogItem?.code || "") === code);
                    const currentProduct = String(mapForm.product || "").trim();
                    const nextProduct = item ? ((item.products || []).includes(currentProduct) ? currentProduct : (item.product || item.products?.[0] || currentProduct)) : currentProduct;
                    const family = productFamilies.find(product => String(product?.product || "") === nextProduct);
                    const nextStages = item?.stagesByProduct?.[normalizeId(nextProduct)] || item?.stages || family?.stages || stageOptions;
                    const internalStage = nextStages?.[0] || code;
                    setMapForm(current => ({ ...current, product: nextProduct, productCode: code, projectCode: code, stage: internalStage, stages: internalStage ? [internalStage] : [], stageCode: code }));
                  }}
                />
                <small className="field-help">One code field is used for Product Name mapping.</small>
              </label>


              {/* PROBABILITY */}

              <label>
                Probability

                <select
                  required
                  value={mapForm.category}
                  onChange={(event) =>
                    setMap("category", event.target.value)
                  }
                >
                  {MAPPING_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              {/* START DATE */}

              <label>
                Start date

                <input
                  required
                  type="date"
                  value={mapForm.startDate}
                  onChange={(event) =>
                    setMap("startDate", event.target.value)
                  }
                />
              </label>

              {/* END DATE */}

              <label>
                End date

                <input
                  required
                  type="date"
                  min={mapForm.startDate || undefined}
                  value={mapForm.endDate}
                  onChange={(event) =>
                    setMap("endDate", event.target.value)
                  }
                />
              </label>
            </div>

            {/* MODAL ACTIONS */}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary mapping-cancel-button"
                disabled={busy}
                onClick={() => {
                  setMappingOpen(false);
                  setIsEditing(false);
                  setEditingMappingId(null);
                }}
              >
                Cancel
              </button>

              <button type="submit" className="mapping-save-button" disabled={busy}>
                {busy
                  ? isEditing
                    ? "Saving changes…"
                    : "Saving mapping…"
                  : isEditing
                  ? "Save Changes"
                  : "Save Mapping"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* STATUS MODAL */}

      {statusModal && (
        <Modal
          title={`${statusModal} reactors (${
            statusModal === "Available"
              ? counts.available
              : statusModal === "Mapped"
              ? counts.mapped
              : counts.maintenance
          })`}
          onClose={() => setStatusModal("")}
        >
          <div className="status-reactor-list">
            {(statusModal === "Available"
              ? equipmentList.filter(
                  (reactor) =>
                    isAvailableStatus(reactor.status) &&
                    !String(
                      reactor.projectMapped || ""
                    ).trim() &&
                    !mappingByReactor.byUid.has(
                      String(reactor.uid || "")
                    ) &&
                    !mappingByReactor.byId.has(
                      normalizeId(reactor.id)
                    )
                )
              : statusModal === "Mapped"
              ? mappedRows
              : equipmentList.filter((reactor) =>
                  isMaintenanceStatus(reactor.status)
                )
            ).map((reactor) => (
              <div
                className="status-reactor-row"
                key={reactor.uid || reactor.id}
              >
                <div>
                  <strong>{reactor.id || "Unknown"}</strong>

                  <small>
                    {reactor.site || "No site"} ·{" "}
                    {fmtKL(reactor.capacity)} ·{" "}
                    {reactor.status || statusModal}
                  </small>
                </div>

                {statusModal === "Available" && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusModal("");
                      openMapping(reactor);
                    }}
                  >
                    Map
                  </button>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
