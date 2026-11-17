local pobRoot = os.getenv("POB_ROOT") or "/opt/pob"
package.path = table.concat({
  "/app/pob/?.lua",
  "/app/pob/?/init.lua",
  pobRoot .. "/src/?.lua",
  pobRoot .. "/src/?/init.lua",
  pobRoot .. "/runtime/lua/?.lua",
  pobRoot .. "/runtime/lua/?/init.lua",
  package.path,
}, ";")

local json = require("dkjson")

local function stderr_print(...)
  local parts = { ... }
  for index, value in ipairs(parts) do
    parts[index] = tostring(value)
  end
  io.stderr:write(table.concat(parts, "\t"))
  io.stderr:write("\n")
end

print = stderr_print

local function trim(value)
  if type(value) ~= "string" then
    return nil
  end
  local normalized = value:gsub("^%s+", ""):gsub("%s+$", "")
  if normalized == "" then
    return nil
  end
  return normalized
end

local function normalize_key(value)
  local normalized = trim(value)
  if not normalized then
    return nil
  end
  return normalized:lower():gsub("%s+", " ")
end

local function strip_tree_list_version_prefix(value)
  local normalized = trim(value)
  if not normalized then
    return nil
  end
  return normalized:gsub("^%[[^%]]+%]%s*", "")
end

local function table_length(value)
  if type(value) ~= "table" then
    return 0
  end
  local count = 0
  for _ in pairs(value) do
    count = count + 1
  end
  return count
end

local function read_stdin()
  local chunks = {}
  while true do
    local chunk = io.read(8192)
    if not chunk then
      break
    end
    table.insert(chunks, chunk)
  end
  return table.concat(chunks)
end

local function encode_and_exit(payload, exit_code)
  io.write(json.encode(payload))
  io.write("\n")
  os.exit(exit_code or 0)
end

local function safe_number(value)
  if type(value) == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return nil
    end
    return value
  end
  if type(value) == "string" then
    local parsed = tonumber(value)
    if parsed and parsed == parsed and parsed ~= math.huge and parsed ~= -math.huge then
      return parsed
    end
  end
  return nil
end

local function as_table(value)
  if type(value) == "table" then
    return value
  end
  return {}
end

local function shallow_copy(tbl)
  local copy = {}
  for k, v in pairs(tbl) do
    copy[k] = v
  end
  return copy
end

local input = read_stdin()
if input == "" then
  encode_and_exit({
    status = "failed",
    partialReason = "PoB runtime received an empty payload.",
    summary = {
      runtime = "pob-luajit",
      pob_ref = os.getenv("POB_REF"),
    },
    plans = {},
  }, 1)
end

local payload, _, decode_error = json.decode(input)
if not payload then
  encode_and_exit({
    status = "failed",
    partialReason = "PoB runtime could not decode the JSON payload.",
    summary = {
      runtime = "pob-luajit",
      pob_ref = os.getenv("POB_REF"),
      decode_error = decode_error,
    },
    plans = {},
  }, 1)
end

if not GetVirtualScreenSize then
  function GetVirtualScreenSize()
    return 1920, 1080
  end
end

local function shell_quote(value)
  local normalized = tostring(value or "")
  return "'" .. normalized:gsub("'", [['"'"']]) .. "'"
end

local function command_succeeded(command)
  local ok, exit_type, code = os.execute(command)
  if type(ok) == "number" then
    return ok == 0
  end
  if ok == true then
    return true
  end
  return exit_type == "exit" and code == 0
end

local function read_binary_file(path)
  local handle = io.open(path, "rb")
  if not handle then
    return nil
  end
  local data = handle:read("*a")
  handle:close()
  return data
end

local function write_binary_file(path, data)
  local handle = io.open(path, "wb")
  if not handle then
    return false
  end
  handle:write(data or "")
  handle:close()
  return true
end

local function remove_file(path)
  if path then
    os.remove(path)
  end
end

local function file_size(path)
  local handle = io.open(path, "rb")
  if not handle then
    return nil
  end
  local size = handle:seek("end")
  handle:close()
  return size
end

local function zlib_transform(mode, data)
  if type(data) ~= "string" then
    return nil
  end

  local input_path = os.tmpname()
  local output_path = os.tmpname()
  if not input_path or not output_path then
    return nil
  end

  remove_file(output_path)
  if not write_binary_file(input_path, data) then
    remove_file(input_path)
    remove_file(output_path)
    return nil
  end

  local node_script = table.concat({
    "const fs = require(\"fs\");",
    "const zlib = require(\"zlib\");",
    "const mode = process.argv[1];",
    "const input = process.argv[2];",
    "const output = process.argv[3];",
    "const source = fs.readFileSync(input);",
    "const result = mode === \"inflate\" ? zlib.inflateSync(source) : zlib.deflateSync(source);",
    "fs.writeFileSync(output, result);",
  }, "")

  local command = table.concat({
    "node -e ",
    shell_quote(node_script),
    " ",
    shell_quote(mode),
    " ",
    shell_quote(input_path),
    " ",
    shell_quote(output_path),
    " >/dev/null 2>&1",
  })

  local transformed = nil
  if command_succeeded(command) then
    transformed = read_binary_file(output_path)
  end

  remove_file(input_path)
  remove_file(output_path)
  return transformed
end

local function wildcard_to_lua_pattern(pattern)
  local escaped = tostring(pattern or ""):gsub("([%^%$%(%)%%%.%[%]%+%-%?])", "%%%1")
  return "^" .. escaped:gsub("%*", ".*") .. "$"
end

local function new_file_search(pattern, directories_only)
  if type(pattern) ~= "string" or pattern == "" then
    return nil
  end

  local normalized = pattern:gsub("\\", "/")
  local directory = normalized:match("^(.*)/[^/]*$") or "."
  local file_pattern = normalized:match("^.*/([^/]*)$") or normalized
  directory = directory == "" and "." or directory

  local list_command = table.concat({
    "find ",
    shell_quote(directory),
    " -maxdepth 1 -mindepth 1 -type ",
    directories_only and "d" or "f",
    " -printf '%f\t%T@\n' 2>/dev/null",
  })

  local handle = io.popen(list_command, "r")
  if not handle then
    return nil
  end

  local matches = {}
  local lua_pattern = wildcard_to_lua_pattern(file_pattern)
  for line in handle:lines() do
    local name, modified = line:match("^([^\t]+)\t([^\t]+)$")
    if name and name:match(lua_pattern) then
      table.insert(matches, {
        name = name,
        modified = tonumber(modified) or 0,
      })
    end
  end
  handle:close()

  if #matches == 0 then
    return nil
  end

  table.sort(matches, function(left, right)
    return left.name < right.name
  end)

  local search = {
    entries = matches,
    index = 1,
  }

  function search:GetFileName()
    local entry = self.entries[self.index]
    return entry and entry.name or nil
  end

  function search:GetFileModifiedTime()
    local entry = self.entries[self.index]
    return entry and entry.modified or 0
  end

  function search:NextFile()
    if self.index < #self.entries then
      self.index = self.index + 1
      return true
    end
    return false
  end

  return search
end

local function remove_empty_timeless_bins()
  local timeless_names = {
    "GloriousVanity",
    "LethalPride",
    "BrutalRestraint",
    "MilitantFaith",
    "ElegantHubris",
    "HeroicTragedy",
  }

  for _, name in ipairs(timeless_names) do
    local bin_path = pobRoot .. "/src/Data/TimelessJewelData/" .. name .. ".bin"
    if file_size(bin_path) == 0 then
      remove_file(bin_path)
    end
  end
end

assert(loadfile("HeadlessWrapper.lua"))()

-- The stock HeadlessWrapper leaves filesystem search and zlib helpers as stubs.
-- PoB relies on those for timeless-jewel data, import links, and a few file lookups.
NewFileSearch = new_file_search
Inflate = function(data)
  return zlib_transform("inflate", data)
end
Deflate = function(data)
  return zlib_transform("deflate", data) or ""
end

-- The stock HeadlessWrapper also stubs GetScriptPath/GetRuntimePath to "", which
-- breaks data lookups that rely on locating files relative to the PoB checkout.
GetScriptPath = function()
  return pobRoot .. "/src"
end

GetRuntimePath = function()
  return pobRoot .. "/runtime"
end

remove_empty_timeless_bins()

local warnings = {}
local MAX_EXACT_RARE_PLANS_PER_SOURCE = 8
local MAX_COMPARE_POWER_TREE_ROWS = 40
local MAX_COMPARE_POWER_ITEM_ROWS = 40

local function add_warning(message)
  if message then
    table.insert(warnings, message)
  end
end

local compare_capability_cache = nil

function detect_compare_capability()
  if compare_capability_cache ~= nil then
    return compare_capability_cache
  end

  local ok_entry = pcall(function()
    return LoadModule("Classes/CompareEntry")
  end)
  local ok_tab = pcall(function()
    return LoadModule("Classes/CompareTab")
  end)

  compare_capability_cache = ok_entry and ok_tab
  return compare_capability_cache
end

local function rebuild_current_build()
  build.modFlag = true
  build.buildFlag = true
  runCallback("OnFrame")
  runCallback("OnFrame")
end

local function force_gc()
  if collectgarbage then
    collectgarbage("collect")
    collectgarbage("collect")
  end
end

-- If the main skill has a stage mechanic (e.g. Reave, Blade Flurry) and the user never
-- explicitly set the stage count in the PoB XML, srcInstance.skillStageCount is nil and
-- PoB defaults to 1 stage — drastically undervaluing skills that scale to 6-8 stages.
-- This function sets it to stagesMax so calculations reflect full-rotation damage.
-- Returns true if the value was changed (caller should rebuild).
local function ensure_main_skill_max_stages()
  if not build or not build.skillsTab then
    stderr_print("[stages] no build or skillsTab")
    return false
  end
  local sg_list = build.skillsTab.socketGroupList or {}
  local sg_idx = build.mainSocketGroup or 1
  local sg = sg_list[sg_idx]
  if not sg then
    stderr_print(string.format("[stages] no socketGroup at index %d", sg_idx))
    return false
  end
  local main_idx = sg.mainActiveSkill or 1
  -- Log all keys on the socket group to understand the headless data model
  do
    local keys = {}
    for k, v in pairs(sg) do
      table.insert(keys, k .. "=" .. type(v))
    end
    stderr_print("[stages] socketGroup keys: " .. table.concat(keys, ", "))
  end
  local dsl = sg.displaySkillList
  local active_skill = dsl and dsl[main_idx]
  stderr_print(string.format("[stages] sg_idx=%d main_idx=%d displaySkillList=%s active_skill=%s",
    sg_idx, main_idx, tostring(dsl ~= nil), tostring(active_skill ~= nil)))
  if not active_skill then
    -- Try alternate access: sg.activeSkillList
    local asl = sg.activeSkillList
    active_skill = asl and asl[main_idx]
    stderr_print(string.format("[stages] fallback activeSkillList=%s active_skill=%s",
      tostring(asl ~= nil), tostring(active_skill ~= nil)))
    if not active_skill then
      return false
    end
  end
  local src_instance = active_skill.activeEffect and active_skill.activeEffect.srcInstance
  local skill_name = active_skill.activeEffect and active_skill.activeEffect.grantedEffect and active_skill.activeEffect.grantedEffect.name or "?"
  local stages_max = safe_number(active_skill.skillData and active_skill.skillData.stagesMax)
  local stage_current = src_instance and src_instance.skillStageCount
  stderr_print(string.format("[stages] skill=%s srcInstance=%s stageCount=%s stagesMax=%s",
    tostring(skill_name), tostring(src_instance ~= nil), tostring(stage_current), tostring(stages_max)))
  if not src_instance then
    return false
  end
  -- Only override when the user has not set a value
  if src_instance.skillStageCount ~= nil then
    return false
  end
  if not stages_max or stages_max <= 1 then
    return false
  end
  src_instance.skillStageCount = stages_max
  stderr_print(string.format("[stages] %s: skillStageCount was nil — set to stagesMax=%d for DPS calculation",
    tostring(skill_name), stages_max))
  return true
end

local function find_tree_spec_id_by_title(value)
  if not build.treeTab then
    return nil
  end

  local normalized_wanted = normalize_key(value)
  if not normalized_wanted then
    return nil
  end

  local display_list = build.treeTab.GetSpecList and build.treeTab:GetSpecList() or {}
  for index, spec in ipairs(build.treeTab.specList or {}) do
    if normalize_key(spec and spec.title) == normalized_wanted then
      return index
    end
    if normalize_key(strip_tree_list_version_prefix(display_list[index])) == normalized_wanted then
      return index
    end
  end

  return nil
end

local function find_tree_spec_id_by_link(value)
  if not build.treeTab then
    return nil
  end

  local raw = trim(value)
  if not raw then
    return nil
  end

  local link_blob = raw:match("%{([%w,]+)%}")
  if not link_blob then
    return nil
  end

  local wanted_links = {}
  for link_id in link_blob:gmatch("[^,]+") do
    local normalized = normalize_key(link_id)
    if normalized then
      table.insert(wanted_links, normalized)
    end
  end

  if #wanted_links == 0 then
    return nil
  end

  local function title_has_match(title)
    local title_text = trim(title)
    if not title_text then
      return false
    end

    local title_links = title_text:match("%{([%w,]+)%}")
    if not title_links then
      return false
    end

    for candidate in title_links:gmatch("[^,]+") do
      local normalized_candidate = normalize_key(candidate)
      for _, wanted_link in ipairs(wanted_links) do
        if normalized_candidate == wanted_link then
          return true
        end
      end
    end

    return false
  end

  local display_list = build.treeTab.GetSpecList and build.treeTab:GetSpecList() or {}
  for index, spec in ipairs(build.treeTab.specList or {}) do
    if title_has_match(spec and spec.title) or title_has_match(strip_tree_list_version_prefix(display_list[index])) then
      return index
    end
  end

  return nil
end

local function select_tree_spec(selection)
  if not build.treeTab or not build.treeTab.specList then
    return nil
  end

  local wanted_title = trim(selection and selection.title)
  if wanted_title then
    local matched_id = find_tree_spec_id_by_title(wanted_title) or find_tree_spec_id_by_link(wanted_title)
    if matched_id then
      build.treeTab:SetActiveSpec(matched_id)
      return matched_id
    end
  end

  local wanted_id = trim(selection and selection.id)
  local numeric_id = wanted_id and tonumber(wanted_id) or nil
  if numeric_id and build.treeTab.specList[numeric_id] then
    build.treeTab:SetActiveSpec(numeric_id)
    return numeric_id
  end

  if wanted_id then
    local matched_id = find_tree_spec_id_by_title(wanted_id) or find_tree_spec_id_by_link(wanted_id)
    if matched_id then
      build.treeTab:SetActiveSpec(matched_id)
      return matched_id
    end
    local available_titles = {}
    local display_list = build.treeTab.GetSpecList and build.treeTab:GetSpecList() or {}
    for index, spec in ipairs(build.treeTab.specList or {}) do
      local title = trim(spec and spec.title) or strip_tree_list_version_prefix(display_list[index]) or "?"
      table.insert(available_titles, tostring(index) .. ":" .. title)
    end
    stderr_print("[tree] failed to resolve requested tree spec id=" .. tostring(wanted_id) .. " title=" .. tostring(wanted_title) .. " available=" .. table.concat(available_titles, " | "))
    add_warning("Requested tree spec could not be resolved; using the build's current active tree.")
  end

  return build.treeTab.activeSpec
end

local function select_ordered_set(order_list, set_map, selection, active_id, setter, warning_label)
  local wanted_title = normalize_key(selection and selection.title)
  if wanted_title then
    for _, set_id in ipairs(order_list or {}) do
      local set_value = set_map[set_id]
      if normalize_key(set_value and set_value.title) == wanted_title then
        setter(set_id)
        return set_id
      end
    end
  end

  local wanted_id = trim(selection and selection.id)
  if wanted_id then
    local numeric_id = tonumber(wanted_id)
    if numeric_id and set_map[numeric_id] then
      setter(numeric_id)
      return numeric_id
    end

    local normalized_id = normalize_key(wanted_id)
    for _, set_id in ipairs(order_list or {}) do
      local set_value = set_map[set_id]
      if normalize_key(set_value and set_value.title) == normalized_id then
        setter(set_id)
        return set_id
      end
    end

    add_warning("Requested " .. warning_label .. " could not be resolved; using the build's current active selection.")
  end

  return active_id
end

local function resolve_item_set(selection)
  if not build.itemsTab then
    return nil
  end

  return select_ordered_set(
    build.itemsTab.itemSetOrderList,
    build.itemsTab.itemSets,
    selection,
    build.itemsTab.activeItemSetId,
    function(set_id)
      build.itemsTab:SetActiveItemSet(set_id)
    end,
    "item set"
  )
end

local function resolve_skill_set(selection)
  if not build.skillsTab then
    return nil
  end

  return select_ordered_set(
    build.skillsTab.skillSetOrderList,
    build.skillsTab.skillSets,
    selection,
    build.skillsTab.activeSkillSetId,
    function(set_id)
      build.skillsTab:SetActiveSkillSet(set_id)
    end,
    "skill set"
  )
end

local function split_loadout_title(title)
  local normalized_title = trim(title)
  if not normalized_title then
    return nil, {}
  end

  local link_blob = normalized_title:match("%{([%w,]+)%}")
  local links = {}
  if link_blob then
    for link_id in link_blob:gmatch("[^,]+") do
      local trimmed_link = trim(link_id)
      if trimmed_link then
        table.insert(links, trimmed_link)
      end
    end
  end

  local plain_title = normalized_title:gsub("%{[%w,]+%}", ""):gsub("^%s+", ""):gsub("%s+$", "")
  if plain_title == "" then
    plain_title = "Default"
  end

  return plain_title, links
end

local function collect_loadout_title_candidates(...)
  local counts = {}
  local ordered = {}

  for _, raw_title in ipairs({...}) do
    local plain_title = split_loadout_title(raw_title)
    local normalized = normalize_key(plain_title)
    if normalized then
      if not counts[normalized] then
        counts[normalized] = { count = 0, title = plain_title }
        table.insert(ordered, normalized)
      end
      counts[normalized].count = counts[normalized].count + 1
    end
  end

  table.sort(ordered, function(left, right)
    if counts[left].count ~= counts[right].count then
      return counts[left].count > counts[right].count
    end
    return (counts[left].title or "") < (counts[right].title or "")
  end)

  local result = {}
  for _, key in ipairs(ordered) do
    table.insert(result, counts[key].title)
  end
  return result
end

local function collect_shared_loadout_links(...)
  local link_counts = {}

  for _, raw_title in ipairs({...}) do
    local _, links = split_loadout_title(raw_title)
    local seen_for_title = {}
    for _, link_id in ipairs(links) do
      local normalized = normalize_key(link_id)
      if normalized and not seen_for_title[normalized] then
        seen_for_title[normalized] = true
        link_counts[normalized] = (link_counts[normalized] or 0) + 1
      end
    end
  end

  local ordered = {}
  for key, count in pairs(link_counts) do
    table.insert(ordered, { key = key, count = count })
  end

  table.sort(ordered, function(left, right)
    if left.count ~= right.count then
      return left.count > right.count
    end
    return left.key < right.key
  end)

  local result = {}
  for _, entry in ipairs(ordered) do
    table.insert(result, entry.key)
  end
  return result
end

local function config_set_has_link(config_set, wanted_link)
  local _, links = split_loadout_title(config_set and config_set.title)
  for _, link_id in ipairs(links) do
    if normalize_key(link_id) == wanted_link then
      return true
    end
  end
  return false
end

local function find_config_set_id_by_title(order_list, set_map, value)
  local normalized_wanted = normalize_key(value)
  if not normalized_wanted then
    return nil
  end

  for _, set_id in ipairs(order_list or {}) do
    local config_set = set_map[set_id]
    local config_title = split_loadout_title(config_set and config_set.title)
    if normalize_key(config_title) == normalized_wanted then
      return set_id
    end
  end

  return nil
end

local function find_config_set_id_by_link(order_list, set_map, value)
  local _, links = split_loadout_title(value)
  for _, wanted_link in ipairs(links) do
    local normalized_wanted = normalize_key(wanted_link)
    if normalized_wanted then
      for _, set_id in ipairs(order_list or {}) do
        local config_set = set_map[set_id]
        if config_set_has_link(config_set, normalized_wanted) then
          return set_id
        end
      end
    end
  end

  return nil
end

local function resolve_config_set(selection)
  if not build.configTab then
    return nil, "unavailable"
  end

  local order_list = build.configTab.configSetOrderList or {}
  local set_map = build.configTab.configSets or {}
  if #order_list == 0 then
    return build.configTab.activeConfigSetId, "default"
  end

  local original_active_config_set_id = build.configTab.activeConfigSetId

  local function activate(set_id, source)
    if set_id and set_map[set_id] then
      build.configTab:SetActiveConfigSet(set_id)
      return set_id, source
    end
    return nil, nil
  end

  local function try_selection_config(selection_value, source_prefix)
    local wanted_title = trim(selection_value and selection_value.title)
    if wanted_title then
      local matched_id = find_config_set_id_by_title(order_list, set_map, wanted_title)
        or find_config_set_id_by_link(order_list, set_map, wanted_title)
      if matched_id then
        return activate(matched_id, source_prefix .. "_title")
      end
    end

    local wanted_id = trim(selection_value and selection_value.id)
    if wanted_id then
      local numeric_id = tonumber(wanted_id)
      if numeric_id and set_map[numeric_id] then
        return activate(numeric_id, source_prefix .. "_id")
      end

      local matched_id = find_config_set_id_by_title(order_list, set_map, wanted_id)
        or find_config_set_id_by_link(order_list, set_map, wanted_id)
      if matched_id then
        return activate(matched_id, source_prefix .. "_id_alias")
      end
    end

    return nil, nil
  end

  local explicit_config_set_id, explicit_source = try_selection_config(selection, "target")
  if explicit_config_set_id then
    return explicit_config_set_id, explicit_source
  end

  local active_tree_title = build.treeTab and build.treeTab.specList and build.treeTab.specList[build.treeTab.activeSpec]
    and build.treeTab.specList[build.treeTab.activeSpec].title or nil
  local active_item_title = build.itemsTab and build.itemsTab.itemSets and build.itemsTab.itemSets[build.itemsTab.activeItemSetId]
    and build.itemsTab.itemSets[build.itemsTab.activeItemSetId].title or nil
  local active_skill_title = build.skillsTab and build.skillsTab.skillSets and build.skillsTab.skillSets[build.skillsTab.activeSkillSetId]
    and build.skillsTab.skillSets[build.skillsTab.activeSkillSetId].title or nil

  for _, wanted_link in ipairs(collect_shared_loadout_links(active_tree_title, active_item_title, active_skill_title)) do
    for _, set_id in ipairs(order_list) do
      local config_set = set_map[set_id]
      if config_set_has_link(config_set, wanted_link) then
        return activate(set_id, "linked_loadout")
      end
    end
  end

  for _, wanted_title in ipairs(collect_loadout_title_candidates(active_tree_title, active_item_title, active_skill_title)) do
    local matched_id = find_config_set_id_by_title(order_list, set_map, wanted_title)
    if matched_id then
      return activate(matched_id, "matching_loadout_title")
    end
  end

  if original_active_config_set_id and set_map[original_active_config_set_id] then
    return activate(original_active_config_set_id, "build_active")
  end

  if build.configTab.activeConfigSetId and set_map[build.configTab.activeConfigSetId] then
    return build.configTab.activeConfigSetId, "current_active"
  end

  if order_list[1] and set_map[order_list[1]] then
    return activate(order_list[1], "first_available")
  end

  return build.configTab.activeConfigSetId, "unknown"
end

local function collect_configuration_selection(active_config_set, resolved_config_set_id, resolved_config_set_source)
  return {
    set_id = resolved_config_set_id and tostring(resolved_config_set_id) or nil,
    set_title = trim(active_config_set and active_config_set.title),
    source = trim(resolved_config_set_source),
  }
end

local cached_config_option_definitions = nil

local function strip_pob_formatting(value)
  if type(value) ~= "string" then
    return nil
  end
  local normalized = value
    :gsub("%^x%x%x%x%x%x%x", "")
    :gsub("%^%w", "")
  return trim(normalized)
end

local function sanitize_config_display_label(value, drop_trailing_colon)
  local normalized = strip_pob_formatting(value)
  if not normalized then
    return nil
  end
  if drop_trailing_colon then
    normalized = normalized:gsub(":+$", "")
  end
  return trim(normalized)
end

local function config_values_equal(left, right)
  if left == right then
    return true
  end
  local left_number = safe_number(left)
  local right_number = safe_number(right)
  if left_number and right_number then
    return left_number == right_number
  end
  return false
end

local function config_value_matches_default(var_data, value, default_value)
  local value_type = var_data and var_data.type

  if value_type == "check" then
    return (value == true) == (default_value == true)
  end

  if value_type == "count" or value_type == "integer" or value_type == "countAllowZero" or value_type == "float" then
    return (safe_number(value) or 0) == (safe_number(default_value) or 0)
  end

  if value_type == "text" then
    return (trim(type(value) == "string" and value or tostring(value or "")) or "")
      == (trim(type(default_value) == "string" and default_value or tostring(default_value or "")) or "")
  end

  return config_values_equal(value, default_value)
end

local function format_config_display_value(value)
  if value == nil then
    return nil
  end
  if type(value) == "boolean" then
    return value and "Enabled" or "Disabled"
  end
  local numeric = safe_number(value)
  if numeric then
    local integer = math.floor(numeric)
    if numeric == integer then
      return tostring(integer)
    end
    return tostring(numeric)
  end
  local sanitized = sanitize_config_display_label(value)
  if sanitized then
    return sanitized
  end
  return tostring(value)
end

local function get_config_option_definitions()
  if cached_config_option_definitions ~= nil then
    return cached_config_option_definitions
  end

  cached_config_option_definitions = {}
  if LoadModule then
    local ok, result = pcall(LoadModule, "Modules/ConfigOptions")
    if ok and type(result) == "table" then
      cached_config_option_definitions = result
    else
      stderr_print("[config] failed to load Modules/ConfigOptions: " .. tostring(result))
    end
  end

  return cached_config_option_definitions
end

local function describe_config_option_value(var_data, value)
  if var_data and var_data.type == "list" then
    for _, option in ipairs(var_data.list or {}) do
      if config_values_equal(option.val, value) then
        return sanitize_config_display_label(option.label) or format_config_display_value(option.val)
      end
    end
  end

  return format_config_display_value(value)
end

local function collect_configuration_insights(active_config_set)
  local config_tab = build and build.configTab
  if not config_tab or not active_config_set then
    return nil
  end

  local definitions = get_config_option_definitions()
  local sections = {}
  local sections_by_label = {}
  local current_section_label = "General"
  local current_context_label = nil
  local enabled_count = 0

  local function ensure_section(label)
    local normalized = label or "Other"
    local existing = sections_by_label[normalized]
    if existing then
      return existing
    end

    local created = {
      label = normalized,
      entries = {},
    }
    sections_by_label[normalized] = created
    table.insert(sections, created)
    return created
  end

  for _, var_data in ipairs(definitions) do
    if var_data.section then
      current_section_label = sanitize_config_display_label(var_data.section) or current_section_label or "Other"
      current_context_label = nil
    elseif var_data.var then
      local input_value = active_config_set.input and active_config_set.input[var_data.var]
      local placeholder_value = active_config_set.placeholder and active_config_set.placeholder[var_data.var]
      local default_input = config_tab.defaultState and config_tab.defaultState[var_data.var]
      local default_placeholder = var_data.defaultPlaceholderState
      local value = nil
      local source = nil

      if not config_value_matches_default(var_data, input_value, default_input) then
        value = input_value
        source = "input"
      elseif not config_value_matches_default(var_data, placeholder_value, default_placeholder) then
        value = placeholder_value
        source = "placeholder"
      end

      if source and value ~= nil then
        local label = sanitize_config_display_label(var_data.label) or sanitize_config_display_label(var_data.var)
        local display_value = describe_config_option_value(var_data, value)
        if label and display_value then
          table.insert(ensure_section(current_section_label).entries, {
            var = var_data.var,
            label = label,
            value = display_value,
            type = trim(var_data.type) or "unknown",
            source = source,
            context_label = current_context_label,
          })
          enabled_count = enabled_count + 1
        end
      end
    elseif var_data.label then
      current_context_label = sanitize_config_display_label(var_data.label, true)
    end
  end

  return {
    set_id = tostring(config_tab.activeConfigSetId),
    set_title = trim(active_config_set.title),
    enabled_count = enabled_count,
    sections = sections,
  }
end

local overlay_inventory_ids = {
  Weapon = true,
  Offhand = true,
  Weapon2 = true,
  Offhand2 = true,
  Helm = true,
  BodyArmour = true,
  Gloves = true,
  Boots = true,
  Amulet = true,
  Ring = true,
  Ring2 = true,
  Ring3 = true,
  Belt = true,
  Flask = true,
  BrequelGrafts = true,
  BrequelGrafts2 = true,
  VisceraHead = true, VisceraBody = true, VisceraArm = true, VisceraLeg = true,
}

local function apply_character_overlay(character_snapshot)
  -- A missing current part must never retain a target Wickerman bonus.
  for _, part in ipairs({ "Head", "Body", "Arm", "Leg" }) do
    local slot = build.itemsTab.slots[part]
    if slot and slot.selItemId and slot.selItemId ~= 0 then
      build.itemsTab:DeleteItem(build.itemsTab.items[slot.selItemId])
    end
  end
  local raw_items = as_table(character_snapshot and character_snapshot.overlay_items)
  local item_source = "character_snapshot.overlay_items"
  if #raw_items == 0 then
    local raw_character = as_table(character_snapshot and character_snapshot.raw_character)
    raw_items = as_table(raw_character.items)
    item_source = "raw_character.items"
    if #raw_items == 0 then
      raw_items = {}
      item_source = "raw_character.equipment+inventory+jewels"
      for _, item in ipairs(as_table(raw_character.equipment)) do
        table.insert(raw_items, item)
      end
      for _, item in ipairs(as_table(raw_character.inventory)) do
        table.insert(raw_items, item)
      end
      for _, item in ipairs(as_table(raw_character.jewels)) do
        table.insert(raw_items, item)
      end
    end
  end
  stderr_print(string.format("[overlay] source=%s raw_item_count=%d", tostring(item_source), #raw_items))
  local equipped_count = 0

  for _, item_data in ipairs(raw_items) do
    local inventory_id = trim(item_data and (item_data.inventoryId or item_data.slot))
    if inventory_id and overlay_inventory_ids[inventory_id] then
      local item_name = trim(item_data.name or item_data.typeLine or inventory_id) or inventory_id
      -- Log socketed gems for body armour to diagnose DPS discrepancy
      local sockets_info = ""
      if item_data.socketedItems then
        local gem_names = {}
        for _, socketed in ipairs(item_data.socketedItems) do
          local gname = trim(socketed.typeLine or socketed.baseType or "?")
          if gname then table.insert(gem_names, gname) end
        end
        sockets_info = " gems=[" .. table.concat(gem_names, ", ") .. "]"
      end
      stderr_print("[overlay] importing " .. inventory_id .. ": " .. item_name .. sockets_info)
      -- Strip socketedItems so ImportItem does not overwrite PoB gem levels/quality
      -- with in-game values. Item mods/affixes are still imported correctly.
      local item_data_no_gems = {}
      for k, v in pairs(item_data) do
        if k ~= "socketedItems" then
          item_data_no_gems[k] = v
        end
      end
      build.importTab:ImportItem(item_data_no_gems)
      equipped_count = equipped_count + 1
    end
  end

  if equipped_count == 0 then
    add_warning("No current character equipment overlay was applied; PoB evaluated the mapped stage loadout directly.")
  end

  if character_snapshot then
    character_snapshot.overlay_items = nil
    character_snapshot.raw_character = nil
  end
  collectgarbage("collect")

  return equipped_count
end

local offensive_output_metric_map = {
  totalDps = "TotalDPS",
  combinedDps = "CombinedDPS",
  fullDps = "FullDPS",
  totalDotDps = "TotalDotDPS",
}

local player_output_metric_map = {
  totalEhp = "TotalEHP",
  life = "Life",
  mana = "Mana",
  energyShield = "EnergyShield",
  armour = "Armour",
  evasion = "Evasion",
  ward = "Ward",
  fireResist = "FireResist",
  coldResist = "ColdResist",
  lightningResist = "LightningResist",
  chaosResist = "ChaosResist",
  physicalMaximumHitTaken = "PhysicalMaximumHitTaken",
  fireMaximumHitTaken = "FireMaximumHitTaken",
  coldMaximumHitTaken = "ColdMaximumHitTaken",
  lightningMaximumHitTaken = "LightningMaximumHitTaken",
  chaosMaximumHitTaken = "ChaosMaximumHitTaken",
}

local function read_active_skill_name(active_skill)
  local active_effect = active_skill and active_skill.activeEffect or nil
  return trim(active_effect and active_effect.grantedEffect and active_effect.grantedEffect.name)
    or trim(active_effect and active_effect.srcInstance and active_effect.srcInstance.skillName)
end

local function get_main_skill_metrics_state()
  local calcs_tab = build and build.calcsTab or nil
  local main_env = calcs_tab and calcs_tab.mainEnv or nil
  local player = main_env and main_env.player or nil
  local main_skill = player and player.mainSkill or nil
  local player_output = player and player.output or calcs_tab and calcs_tab.mainOutput or nil
  local minion_output = player_output and player_output.Minion or nil
  local skill_flags = main_skill and main_skill.skillFlags or nil

  return {
    main_skill = main_skill,
    main_skill_name = read_active_skill_name(main_skill),
    player_output = player_output,
    minion_output = type(minion_output) == "table" and minion_output or nil,
    has_minion = skill_flags and skill_flags.haveMinion == true or false,
  }
end

local function should_auto_show_minion_stats(state)
  local metrics_state = state or get_main_skill_metrics_state()
  return metrics_state.has_minion == true and metrics_state.minion_output ~= nil
end

local function sync_main_skill_minion_stats_toggle()
  local calcs_tab = build and build.calcsTab or nil
  local input = calcs_tab and calcs_tab.input or nil
  if not input then
    return false
  end

  local state = get_main_skill_metrics_state()
  local should_show_minion = should_auto_show_minion_stats(state)
  if input.showMinion == should_show_minion then
    return false
  end

  input.showMinion = should_show_minion
  stderr_print(string.format(
    "[minion] auto-set showMinion=%s skill=%s hasMinion=%s",
    tostring(should_show_minion),
    tostring(state.main_skill_name or "?"),
    tostring(state.has_minion)
  ))
  return true
end

local function collect_metrics()
  local state = get_main_skill_metrics_state()
  local player_output = state.player_output
  local offensive_output = should_auto_show_minion_stats(state) and state.minion_output or player_output
  local metrics = {}
  if not player_output then
    return metrics
  end

  for metric_key, output_key in pairs(offensive_output_metric_map) do
    local value = safe_number(offensive_output and offensive_output[output_key])
    if value ~= nil then
      metrics[metric_key] = value
    end
  end

  for metric_key, output_key in pairs(player_output_metric_map) do
    local value = safe_number(player_output[output_key])
    if value ~= nil then
      metrics[metric_key] = value
    end
  end

  metrics.characterLevel = safe_number(build.characterLevel)
  metrics.mainSocketGroup = safe_number(build.mainSocketGroup)
  return metrics
end

local function read_tree_node_name(node)
  return trim(node and (node.name or node.dn or node.title))
end

local function collect_unique_trimmed_strings(values)
  local seen = {}
  local collected = {}

  for _, value in ipairs(as_table(values)) do
    local trimmed = trim(value)
    local normalized = normalize_key(trimmed)
    if trimmed and normalized and not seen[normalized] then
      seen[normalized] = true
      table.insert(collected, trimmed)
    end
  end

  table.sort(collected)
  return collected
end

local function get_tree_node(tree_nodes, node_id)
  if type(tree_nodes) ~= "table" then
    return nil
  end

  local numeric_id = tonumber(node_id)
  if numeric_id and tree_nodes[numeric_id] then
    return tree_nodes[numeric_id]
  end

  return tree_nodes[node_id]
end

local function is_keystone_node(node)
  return node and (node.isKeystone == true or node.ks == true) or false
end

local function collect_available_keystones(tree_nodes)
  local names = {}

  for _, node in pairs(as_table(tree_nodes)) do
    if is_keystone_node(node) then
      table.insert(names, read_tree_node_name(node))
    end
  end

  return collect_unique_trimmed_strings(names)
end

local function collect_allocated_keystones(spec, tree_nodes)
  local names = {}

  for node_id, allocated in pairs(as_table(spec and spec.allocNodes)) do
    if allocated then
      local node = get_tree_node(tree_nodes, node_id)
      if is_keystone_node(node) then
        table.insert(names, read_tree_node_name(node))
      end
    end
  end

  return collect_unique_trimmed_strings(names)
end

local function collect_profile_keystones(character_snapshot, tree_nodes)
  local names = {}
  local passive_tree = as_table(character_snapshot and character_snapshot.passive_tree)

  for _, node_id in ipairs(as_table(passive_tree.hashes)) do
    local node = get_tree_node(tree_nodes, node_id)
    if is_keystone_node(node) then
      table.insert(names, read_tree_node_name(node))
    end
  end

  for _, node_id in ipairs(as_table(passive_tree.hashesEx)) do
    local node = get_tree_node(tree_nodes, node_id)
    if is_keystone_node(node) then
      table.insert(names, read_tree_node_name(node))
    end
  end

  return collect_unique_trimmed_strings(names)
end

local function get_current_calcs_state()
  return build.calcsTab and build.calcsTab.mainEnv or nil, build.calcsTab and build.calcsTab.mainOutput or nil
end

local function calculate_required_mana_reservation(env, output)
  local player = env and env.player or nil
  local max_mana = safe_number(output and output.Mana)
  if not player or max_mana == nil then
    return nil, max_mana
  end

  local reserved_base = safe_number(player.reserved_ManaBase) or 0
  local reserved_percent = safe_number(player.reserved_ManaPercent) or 0
  return reserved_base + math.ceil(max_mana * reserved_percent / 100), max_mana
end

local function calculate_reserved_mana_delta(env, output)
  local required_total, max_mana = calculate_required_mana_reservation(env, output)
  if required_total == nil or max_mana == nil then
    return nil, required_total, max_mana
  end

  return max_mana - required_total, required_total, max_mana
end

local function collect_target_skill_names(target_stage, baseline_context)
  local skill_set = as_table(target_stage and target_stage.skill_set)
  local names = {}

  for _, gem_name in ipairs(as_table(skill_set.gemNames)) do
    table.insert(names, gem_name)
  end

  if #names == 0 then
    for _, gem in ipairs(as_table(skill_set.gems)) do
      if gem.enabled ~= false then
        table.insert(names, gem.name)
      end
    end
  end

  if #names == 0 then
    for _, socket_group in ipairs(as_table(baseline_context and baseline_context.active_skill_set and baseline_context.active_skill_set.socketGroupList)) do
      for _, gem_instance in ipairs(as_table(socket_group and socket_group.gemList)) do
        if gem_instance.enabled ~= false then
          table.insert(names, gem_instance.nameSpec)
        end
      end
    end
  end

  return collect_unique_trimmed_strings(names)
end

local function collect_active_skill_reservations(env)
  local reservations = {}

  for _, active_skill in ipairs(as_table(env and env.player and env.player.activeSkillList)) do
    local skill_data = as_table(active_skill and active_skill.skillData)
    local mana_reserved_base = safe_number(skill_data.ManaReservedBase) or 0
    local mana_reserved_percent = safe_number(skill_data.ManaReservedPercent) or 0
    if mana_reserved_base > 0 or mana_reserved_percent > 0 then
      table.insert(reservations, {
        name = trim(active_skill and active_skill.activeEffect and active_skill.activeEffect.grantedEffect and active_skill.activeEffect.grantedEffect.name)
          or trim(active_skill and active_skill.skillCfg and active_skill.skillCfg.skillName)
          or "Reservation skill",
        mana_reserved_base = mana_reserved_base,
        mana_reserved_percent = mana_reserved_percent,
      })
    end
  end

  table.sort(reservations, function(left, right)
    if (left.mana_reserved_base or 0) ~= (right.mana_reserved_base or 0) then
      return (left.mana_reserved_base or 0) > (right.mana_reserved_base or 0)
    end

    return (left.mana_reserved_percent or 0) > (right.mana_reserved_percent or 0)
  end)

  return reservations
end

local function format_reservation_entry(entry)
  local skill_name = trim(entry and entry.name) or "Reservation skill"
  local mana_reserved_base = math.floor((safe_number(entry and entry.mana_reserved_base) or 0) + 0.5)
  local mana_reserved_percent = safe_number(entry and entry.mana_reserved_percent) or 0

  if mana_reserved_percent > 0 then
    return skill_name .. " reserves about " .. mana_reserved_base .. " mana (" .. string.format("%.1f", mana_reserved_percent) .. "%)."
  end

  return skill_name .. " reserves about " .. mana_reserved_base .. " mana."
end

local adjustable_reservation_gems = {
  clarity = true,
  precision = true,
  vitality = true,
}

local function collect_adjustable_reservation_gems(skill_set)
  local entries = {}

  for _, socket_group in ipairs(as_table(skill_set and skill_set.socketGroupList)) do
    for _, gem_instance in ipairs(as_table(socket_group and socket_group.gemList)) do
      if gem_instance.enabled ~= false then
        local gem_name = trim(gem_instance.nameSpec or gem_instance.name)
        local normalized_name = normalize_key(gem_name)
        if normalized_name and adjustable_reservation_gems[normalized_name] then
          local current_level = safe_number(gem_instance.level) or 1
          local max_level = safe_number(gem_instance.naturalMaxLevel)
            or safe_number(gem_instance.gemData and gem_instance.gemData.naturalMaxLevel)
            or current_level
          if max_level < current_level then
            max_level = current_level
          end

          table.insert(entries, {
            name = gem_name,
            normalized_name = normalized_name,
            socket_group = socket_group,
            gem_instance = gem_instance,
            original_level = current_level,
            current_level = current_level,
            max_level = max_level,
          })
        end
      end
    end
  end

  return entries
end

local function process_socket_groups(group_set)
  for socket_group in pairs(group_set) do
    build.skillsTab:ProcessSocketGroup(socket_group)
  end
end

local function restore_adjustable_gems(entries)
  if not build.skillsTab then
    return
  end

  local touched_groups = {}
  for _, entry in ipairs(entries) do
    entry.gem_instance.level = entry.original_level
    entry.current_level = entry.original_level
    touched_groups[entry.socket_group] = true
  end

  process_socket_groups(touched_groups)
  rebuild_current_build()
end

local function evaluate_adjusted_level(entry, next_level)
  if not build.skillsTab then
    return nil
  end

  local original_level = safe_number(entry.gem_instance.level) or entry.current_level
  entry.gem_instance.level = next_level
  build.skillsTab:ProcessSocketGroup(entry.socket_group)
  rebuild_current_build()

  local env, output = get_current_calcs_state()
  local next_delta = calculate_reserved_mana_delta(env, output)

  entry.gem_instance.level = original_level
  build.skillsTab:ProcessSocketGroup(entry.socket_group)
  rebuild_current_build()

  return next_delta
end

local function apply_adjusted_level(entry, next_level)
  if not build.skillsTab then
    return nil
  end

  entry.gem_instance.level = next_level
  build.skillsTab:ProcessSocketGroup(entry.socket_group)
  rebuild_current_build()

  entry.current_level = safe_number(entry.gem_instance.level) or next_level

  local env, output = get_current_calcs_state()
  return calculate_reserved_mana_delta(env, output)
end

local function find_best_blocked_adjustment(entries, current_delta)
  local best = nil

  for _, entry in ipairs(entries) do
    local current_level = safe_number(entry.gem_instance.level) or entry.current_level
    if current_level > 1 then
      local next_level = current_level - 1
      local next_delta = evaluate_adjusted_level(entry, next_level)
      if next_delta and next_delta > current_delta then
        local improvement = next_delta - current_delta
        if not best or improvement > best.improvement then
          best = {
            entry = entry,
            next_level = next_level,
            next_delta = next_delta,
            improvement = improvement,
          }
        end
      end
    end
  end

  return best
end

local function find_best_excess_adjustment(entries, current_delta)
  local best = nil

  for _, entry in ipairs(entries) do
    local current_level = safe_number(entry.gem_instance.level) or entry.current_level
    local max_level = safe_number(entry.max_level) or current_level
    if current_level < max_level then
      local next_level = current_level + 1
      local next_delta = evaluate_adjusted_level(entry, next_level)
      if next_delta and next_delta >= 0 and next_delta < current_delta then
        local consumption = current_delta - next_delta
        if not best or consumption > best.consumption then
          best = {
            entry = entry,
            next_level = next_level,
            next_delta = next_delta,
            consumption = consumption,
          }
        end
      end
    end
  end

  return best
end

local function get_reservation_excess_threshold(max_mana)
  local numeric_max = safe_number(max_mana) or 0
  if numeric_max <= 0 then
    return 25
  end

  return math.max(25, math.min(150, math.floor(numeric_max * 0.05 + 0.5)))
end

local function simulate_reservation_adjustments(mode, current_delta, max_mana, active_skill_set)
  local adjustable_entries = collect_adjustable_reservation_gems(active_skill_set)
  if #adjustable_entries == 0 then
    return {}
  end

  local threshold = get_reservation_excess_threshold(max_mana)
  local working_delta = current_delta
  local step_count = 0

  while step_count < 24 do
    local best_step = nil
    if mode == "blocked" and working_delta < 0 then
      best_step = find_best_blocked_adjustment(adjustable_entries, working_delta)
    elseif mode == "excess" and working_delta > threshold then
      best_step = find_best_excess_adjustment(adjustable_entries, working_delta)
    else
      break
    end

    if not best_step then
      break
    end

    local next_delta = apply_adjusted_level(best_step.entry, best_step.next_level)
    if next_delta == nil then
      break
    end

    working_delta = next_delta
    step_count = step_count + 1
  end

  local suggestions = {}
  for _, entry in ipairs(adjustable_entries) do
    if entry.current_level ~= entry.original_level then
      local reason
      if mode == "blocked" then
        reason = "Lower " .. entry.name .. " from level " .. entry.original_level .. " to " .. entry.current_level .. " to free enough mana for the selected skill package."
      else
        reason = "Raise " .. entry.name .. " from level " .. entry.original_level .. " to " .. entry.current_level .. " while keeping the reservation fit non-negative."
      end

      table.insert(suggestions, {
        kind = "gem_level",
        gem_name = entry.name,
        current_level = entry.original_level,
        suggested_level = entry.current_level,
        reason = reason,
      })
    end
  end

  restore_adjustable_gems(adjustable_entries)
  table.sort(suggestions, function(left, right)
    return (left.gem_name or "") < (right.gem_name or "")
  end)

  return suggestions
end

local function build_reservation_audit(target_stage, baseline_context)
  local active_skill_set = baseline_context and baseline_context.active_skill_set or nil
  local env, output = get_current_calcs_state()
  local reservations = collect_active_skill_reservations(env)
  local reservation_gem_names = {}
  for _, entry in ipairs(reservations) do
    if entry.name then
      table.insert(reservation_gem_names, entry.name)
    end
  end
  local reserved_mana_delta, required_total, max_mana = calculate_reserved_mana_delta(env, output)
  local target_skill_set = as_table(target_stage and target_stage.skill_set)
  local target_skill_set_title = trim(target_skill_set.title) or trim(active_skill_set and active_skill_set.title)
  local target_skill_set_id = trim(target_skill_set.id) or trim(baseline_context and baseline_context.resolved_skill_set_id)
  local notes = {}

  if target_skill_set_title then
    table.insert(notes, "Target skill set: " .. target_skill_set_title .. ".")
  end

  if required_total and max_mana and max_mana > 0 then
    local percent_reserved = required_total / max_mana * 100
    table.insert(
      notes,
      "Current build reserves about "
        .. math.floor(required_total + 0.5)
        .. " / "
        .. math.floor(max_mana + 0.5)
        .. " mana ("
        .. string.format("%.1f", percent_reserved)
        .. "%)."
    )
  end

  for index = 1, math.min(3, #reservations) do
    table.insert(notes, format_reservation_entry(reservations[index]))
  end

  local audit = {
    status = "unknown",
    target_skill_set_id = target_skill_set_id,
    target_skill_set_title = target_skill_set_title,
    target_gems = reservation_gem_names,
    reserved_mana_delta = reserved_mana_delta,
    blockers = {},
    surplus_sources = {},
    notes = notes,
    suggestions = {},
  }

  if #reservation_gem_names == 0 then
    table.insert(audit.notes, "No active reservation skills were detected for this build.")
    return audit
  end

  if reserved_mana_delta == nil or max_mana == nil or max_mana <= 0 then
    table.insert(audit.notes, "Mana reservation math could not be derived from the PoB runtime.")
    return audit
  end

  if reserved_mana_delta < 0 then
    audit.status = "blocked"
    table.insert(
      audit.blockers,
      "Needs about " .. math.abs(math.floor(reserved_mana_delta - 0.5)) .. " more unreserved mana to fit the selected skill package."
    )
    for index = 1, math.min(3, #reservations) do
      table.insert(audit.blockers, format_reservation_entry(reservations[index]))
    end
    audit.suggestions = simulate_reservation_adjustments(
      "blocked",
      reserved_mana_delta,
      max_mana,
      active_skill_set
    )
    return audit
  end

  local excess_threshold = get_reservation_excess_threshold(max_mana)
  if reserved_mana_delta > excess_threshold then
    audit.status = "excess"
    table.insert(
      audit.surplus_sources,
      "About " .. math.floor(reserved_mana_delta + 0.5) .. " mana remains unreserved after fitting the selected skill package."
    )
    if active_skill_set then
      local adjustable_entries = collect_adjustable_reservation_gems(active_skill_set)
      if #adjustable_entries > 0 then
        local names = {}
        for _, entry in ipairs(adjustable_entries) do
          table.insert(names, entry.name)
        end
        local flexible_names = collect_unique_trimmed_strings(names)
        if #flexible_names > 0 then
          table.insert(
            audit.surplus_sources,
            "Flexible reservation gems detected: " .. table.concat(flexible_names, ", ") .. "."
          )
        end
      end
    end
    audit.suggestions = simulate_reservation_adjustments(
      "excess",
      reserved_mana_delta,
      max_mana,
      active_skill_set
    )
    return audit
  end

  audit.status = "fit"
  if reserved_mana_delta > 0 then
    table.insert(
      audit.surplus_sources,
      "About " .. math.floor(reserved_mana_delta + 0.5) .. " mana remains unreserved, which is close enough to treat as a normal fit."
    )
  end

  return audit
end

local function decode_pob_code(input)
  local t = trim(input)
  if not t then
    stderr_print("[party] decode_pob_code: input is nil or blank")
    return nil
  end
  -- Already XML
  if t:sub(1, 1) == "<" then
    stderr_print("[party] decode_pob_code: input is raw XML (" .. #t .. " chars)")
    return t
  end
  -- Base64 share code: same encoding PoB uses (url-safe variant)
  local ok, result = pcall(function()
    return Inflate(common.base64.decode(t:gsub("-", "+"):gsub("_", "/")))
  end)
  if ok and result and trim(result) then
    stderr_print("[party] decode_pob_code: decoded share code to XML (" .. #result .. " chars)")
    return result
  end
  stderr_print("[party] decode_pob_code: failed to decode. ok=" .. tostring(ok) .. " result_type=" .. type(result))
  return nil
end

local function strip_party_section_from_xml(xml_text)
  local normalized = trim(xml_text)
  if not normalized then
    return nil
  end

  local stripped = normalized:gsub("%s*<Party.-</Party>%s*", "\n")
  return trim(stripped) or normalized
end

local blocked_enemy_condition_exports = {
  ["Condition:RareOrUnique"] = true,
  ["Condition:PinnacleBoss"] = true,
}

local function sanitize_enemy_conditions_export(buf)
  local normalized = trim(buf)
  if not normalized then
    return ""
  end

  local kept = {}
  for line in normalized:gmatch("([^\n]*)\n?") do
    local trimmed_line = trim(line)
    if trimmed_line and not blocked_enemy_condition_exports[trimmed_line] then
      table.insert(kept, trimmed_line)
    end
  end

  return table.concat(kept, "\n")
end

local function should_keep_enemy_mod_source(source)
  local normalized = normalize_key(source)
  if not normalized then
    return true
  end

  if normalized == "boss" or normalized == "bossskilladditionaldata" then
    return false
  end

  if normalized:find("map mod", 1, true) then
    return false
  end

  return true
end

local function sanitize_enemy_mods_export(buf)
  local normalized = trim(buf)
  if not normalized then
    return ""
  end

  local kept = {}
  local current_name = nil
  local current_mods = {}

  local function flush_group()
    if current_name and #current_mods > 0 then
      table.insert(kept, current_name)
      for _, mod_line in ipairs(current_mods) do
        table.insert(kept, mod_line)
      end
    end
    current_name = nil
    current_mods = {}
  end

  for line in normalized:gmatch("([^\n]*)\n?") do
    local trimmed_line = trim(line)
    if trimmed_line then
      if not trimmed_line:find("|", 1, true) then
        flush_group()
        current_name = trimmed_line
      else
        local parsed_mod = modLib.parseFormattedSourceMod(trimmed_line)
        if parsed_mod and should_keep_enemy_mod_source(parsed_mod.source) then
          table.insert(current_mods, trimmed_line)
        end
      end
    end
  end

  flush_group()
  return table.concat(kept, "\n")
end

local function sanitize_collected_buff_table(buffs)
  if type(buffs) ~= "table" then
    return buffs
  end

  return {
    Aura             = type(buffs.Aura) == "string" and buffs.Aura or "",
    Curse            = type(buffs.Curse) == "string" and buffs.Curse or "",
    Warcry           = type(buffs.Warcry) == "string" and buffs.Warcry or "",
    Link             = type(buffs.Link) == "string" and buffs.Link or "",
    PartyMemberStats = type(buffs.PartyMemberStats) == "string" and buffs.PartyMemberStats or "",
    EnemyConditions  = sanitize_enemy_conditions_export(buffs.EnemyConditions),
    EnemyMods        = sanitize_enemy_mods_export(buffs.EnemyMods),
  }
end

-- Module-level cache of pre-collected party buff tables, populated once before any
-- initialize_stage_context call. All item-swap evaluations read from this.
local precollected_party_buffs = {}

-- Reads ExportedBuffs sections directly from a PoB XML that already has them
-- (i.e. a support code exported with "Export Support" enabled). Fast — no PoB load needed.
local function read_exported_buffs_from_xml(xml_text)
  local dbXML, err = common.xml.ParseXML(xml_text)
  if not dbXML or not dbXML[1] or dbXML[1].elem ~= "PathOfBuilding" then
    stderr_print("[party] read_exported_buffs_from_xml: XML parse failed or root is not PathOfBuilding. err=" .. tostring(err))
    return nil
  end

  local buffs = {}
  for _, tab_node in ipairs(dbXML[1]) do
    if type(tab_node) == "table" and tab_node.elem == "Party" then
      stderr_print("[party] read_exported_buffs_from_xml: found <Party> section")
      for _, node in ipairs(tab_node) do
        if type(node) == "table" and node.elem == "ExportedBuffs" and node.attrib and node.attrib.name then
          local val = node[1] or ""
          stderr_print("[party] read_exported_buffs_from_xml: ExportedBuffs name=" .. tostring(node.attrib.name) .. " len=" .. #val)
          buffs[node.attrib.name] = val
        end
      end
      -- Map PoB's XML key names to our internal keys
      local result = {
        Aura             = buffs["Aura"] or "",
        Curse            = buffs["Curse"] or "",
        Warcry           = buffs["Warcry Skills"] or "",
        Link             = buffs["Link Skills"] or "",
        PartyMemberStats = buffs["PartyMemberStats"] or "",
        EnemyConditions  = buffs["EnemyConditions"] or "",
        EnemyMods        = buffs["EnemyMods"] or "",
      }
      local non_empty = 0
      for _, v in pairs(result) do if v ~= "" then non_empty = non_empty + 1 end end
      stderr_print("[party] read_exported_buffs_from_xml: returning " .. non_empty .. " non-empty buff types from <Party> section")
      if result.Aura ~= "" then
        stderr_print("[party][aura-export] " .. result.Aura:sub(1, 1000))
      end
      return sanitize_collected_buff_table(result)
    end
  end

  stderr_print("[party] read_exported_buffs_from_xml: no <Party> section found in XML")
  return nil  -- No <Party> section found
end

-- Loads a party member's full PoB XML, runs a calculation with enableExportBuffs=true,
-- and returns the exported buff strings keyed by type.
-- Used for group_member entries where the raw_xml may not have ExportedBuffs pre-computed.
-- The caller is responsible for restoring the main build afterwards.
local function collect_party_build_buffs_via_calc(xml_text)
  stderr_print("[party] collect_party_build_buffs_via_calc: loading build (" .. #xml_text .. " char XML)")
  main:SetMode("BUILD", false, "Party Member Build", xml_text, true)
  runCallback("OnFrame")
  runCallback("OnFrame")

  local party_build = build
  if not party_build or not party_build.partyTab then
    stderr_print("[party] collect_party_build_buffs_via_calc: build or partyTab not available after SetMode")
    return nil
  end

  stderr_print("[party] collect_party_build_buffs_via_calc: build loaded, enableExportBuffs=true, triggering calc")
  party_build.partyTab.enableExportBuffs = true
  party_build.modFlag = true
  party_build.buildFlag = true
  runCallback("OnFrame")
  runCallback("OnFrame")

  local raw = {
    Aura             = party_build.partyTab:exportBuffs("Aura"),
    Curse            = party_build.partyTab:exportBuffs("Curse"),
    Warcry           = party_build.partyTab:exportBuffs("Warcry"),
    Link             = party_build.partyTab:exportBuffs("Link"),
    -- PoB serializes party member stat exports under PlayerMods and only renames
    -- them to PartyMemberStats when writing the XML <Party> section.
    PartyMemberStats = party_build.partyTab:exportBuffs("PlayerMods"),
    EnemyConditions  = party_build.partyTab:exportBuffs("EnemyConditions"),
    EnemyMods        = party_build.partyTab:exportBuffs("EnemyMods"),
  }

  local buffs = {}
  local has_any = false
  for k, v in pairs(raw) do
    local val = (type(v) == "string") and v or ""
    buffs[k] = val
    if val ~= "" then
      has_any = true
      stderr_print("[party] collect_party_build_buffs_via_calc: " .. k .. " => " .. #val .. " chars")
      if k == "Aura" then
        -- Log raw export to diagnose effectMult values
        stderr_print("[party][aura-export] " .. val:sub(1, 1000))
      end
    else
      stderr_print("[party] collect_party_build_buffs_via_calc: " .. k .. " => (empty)")
    end
  end

  if not has_any then
    stderr_print("[party] collect_party_build_buffs_via_calc: all buff types are empty — build has no active auras/curses/links/warcries to export")
  end

  return sanitize_collected_buff_table(buffs)
end

-- Applies a collected buff table to a destination partyTab.
local function apply_collected_buffs(buffs, dest_party_tab)
  if not buffs or not dest_party_tab then
    stderr_print("[party] apply_collected_buffs: buffs or dest_party_tab is nil")
    return false
  end
  local applied_any = false

  local function try_apply(buf, list, parse_type, label)
    if buf and buf ~= "" then
      stderr_print("[party] apply_collected_buffs: applying " .. parse_type .. " (" .. #buf .. " chars)")
      dest_party_tab:ParseBuffs(list, buf, parse_type, label)
      applied_any = true
    end
  end

  try_apply(buffs.Aura,             dest_party_tab.actor["Aura"],   "Aura",             nil)
  try_apply(buffs.Curse,            dest_party_tab.actor["Curse"],  "Curse",            nil)
  try_apply(buffs.Warcry,           dest_party_tab.actor["Warcry"], "Warcry",           nil)
  try_apply(buffs.Link,             dest_party_tab.actor["Link"],   "Link",             nil)
  try_apply(buffs.PartyMemberStats, dest_party_tab.actor["modDB"],  "PartyMemberStats", dest_party_tab.actor["output"])
  try_apply(buffs.EnemyConditions,  dest_party_tab.enemyModList,    "EnemyConditions",  nil)
  try_apply(buffs.EnemyMods,        dest_party_tab.enemyModList,    "EnemyMods",        nil)

  if not applied_any then
    stderr_print("[party] apply_collected_buffs: nothing was applied (all buff strings were empty)")
  end

  return applied_any
end

-- Collects buff exports from all party members once. Returns a list of buff tables.
-- For pob_code entries: reads ExportedBuffs directly from the XML (fast, no PoB load).
-- For group_member entries: loads the build in PoB, runs calc, reads exportBuffs() (slow).
-- Each group_member call clobbers `build`, so this must run before the main build is loaded.
local function collect_all_party_buffs(party_builds_list)
  if type(party_builds_list) ~= "table" or #party_builds_list == 0 then return {} end

  local collected = {}
  for _, entry in ipairs(party_builds_list) do
    if type(entry) ~= "table" then goto continue end
    local buffs = nil
    local label = entry.label or entry.kind

    if entry.kind == "pob_code" then
      local xml_text = decode_pob_code(entry.pob_code)
      if xml_text then
        -- Fast path: XML already has <Party><ExportedBuffs> with Aura data baked in.
        -- Only trust this if Aura is non-empty — partial exports (e.g. only Link Skills checked)
        -- will have a <Party> section but no auras, so we must fall through to calc.
        local fast = read_exported_buffs_from_xml(xml_text)
        if fast and fast.Aura and fast.Aura ~= "" then
          buffs = fast
        else
          if fast then
            stderr_print("[party] pob_code <Party> section has no Aura data, falling back to calc: " .. tostring(label))
          else
            stderr_print("[party] pob_code has no <Party> section, using calc: " .. tostring(label))
          end
          buffs = collect_party_build_buffs_via_calc(xml_text)
        end
      end
    elseif entry.kind == "group_member" then
      -- Raw XML from the DB — may or may not have ExportedBuffs; always run calc to be safe.
      local xml_text = entry.raw_xml and trim(entry.raw_xml) or nil
      if xml_text and xml_text ~= "" then
        buffs = collect_party_build_buffs_via_calc(xml_text)
      end
    end

    if buffs then
      table.insert(collected, { label = label, buffs = buffs })
      stderr_print("Collected party buffs from: " .. tostring(label))
    else
      stderr_print("No party buffs collected from: " .. tostring(label))
    end
    ::continue::
  end

  return collected
end

-- Reads effectMult values for all named entries in a sub-table, handling Vaal nesting.
-- list[sub_key] = { Name = { effectMult, modList }, Vaal = { Name = { effectMult, ... } }, ... }
local function extract_effect_mults(list, sub_key, out, prefix)
  prefix = prefix or ""
  local sub = list[sub_key]
  if type(sub) ~= "table" then return end
  for name, data in pairs(sub) do
    if name == "Vaal" and type(data) == "table" then
      for vaal_name, vaal_data in pairs(data) do
        if type(vaal_data) == "table" then
          local eff = vaal_data.effectMult
          if type(eff) == "number" then
            out[prefix .. "Vaal " .. vaal_name] = math.floor(eff + 0.5)
          end
        end
      end
    elseif type(data) == "table" then
      local eff = data.effectMult
      if type(eff) == "number" then
        out[prefix .. name] = math.floor(eff + 0.5)
      end
    end
  end
end

-- Reads the parsed aura/warcry/link effectMult values from partyTab.actor after ParseBuffs.
-- Structure after ParseBuffs("Aura"): actor["Aura"] = { Aura={Name={effectMult,...}}, AuraDebuff={...}, ... }
-- Structure after ParseBuffs("Link"): actor["Link"] = { Link={Name={effectMult,...}} }
-- Structure after ParseBuffs("Warcry"): actor["Warcry"] = { Warcry={Name={effectMult,...}} }
local function read_party_tab_effects(dest_party_tab)
  local result = { auras = {}, links = {}, warcries = {}, curses = {} }
  if not dest_party_tab then return result end

  local aura_top = dest_party_tab.actor["Aura"] or {}
  extract_effect_mults(aura_top, "Aura", result.auras)
  extract_effect_mults(aura_top, "AuraDebuff", result.auras)

  extract_effect_mults(dest_party_tab.actor["Link"] or {}, "Link", result.links)
  extract_effect_mults(dest_party_tab.actor["Warcry"] or {}, "Warcry", result.warcries)
  extract_effect_mults(dest_party_tab.actor["Curse"] or {}, "Curse", result.curses)

  return result
end

local function collected_buffs_have_any_content(buffs)
  if type(buffs) ~= "table" then
    return false
  end

  for _, value in pairs(buffs) do
    if trim(value) then
      return true
    end
  end

  return false
end

local function append_party_buffer_segment(current, addition)
  local chunk = trim(addition)
  if not chunk then
    return current or ""
  end

  local base = trim(current)
  if not base then
    return chunk
  end

  return base .. "\n" .. chunk
end

local function set_party_tab_control_text(control, value)
  if not control then
    return
  end

  local text = value or ""
  if control.SetText then
    control:SetText(text)
  else
    control.buf = text
  end
  control.buf = text
end

local function sync_party_tab_controls(dest_party_tab, aggregated)
  if not dest_party_tab or not dest_party_tab.controls then
    return
  end

  set_party_tab_control_text(dest_party_tab.controls.editPartyMemberStats, aggregated.PartyMemberStats)
  set_party_tab_control_text(dest_party_tab.controls.editAuras, aggregated.Aura)
  set_party_tab_control_text(dest_party_tab.controls.editCurses, aggregated.Curse)
  set_party_tab_control_text(dest_party_tab.controls.editWarcries, aggregated.Warcry)
  set_party_tab_control_text(dest_party_tab.controls.editLinks, aggregated.Link)
  set_party_tab_control_text(dest_party_tab.controls.enemyCond, aggregated.EnemyConditions)
  set_party_tab_control_text(dest_party_tab.controls.enemyMods, aggregated.EnemyMods)

  dest_party_tab.lastContent.PartyMemberStats = dest_party_tab.controls.editPartyMemberStats.buf or ""
  dest_party_tab.lastContent.Aura = dest_party_tab.controls.editAuras.buf or ""
  dest_party_tab.lastContent.Curse = dest_party_tab.controls.editCurses.buf or ""
  dest_party_tab.lastContent.Warcry = dest_party_tab.controls.editWarcries.buf or ""
  dest_party_tab.lastContent.Link = dest_party_tab.controls.editLinks.buf or ""
  dest_party_tab.lastContent.EnemyCond = dest_party_tab.controls.enemyCond.buf or ""
  dest_party_tab.lastContent.EnemyMods = dest_party_tab.controls.enemyMods.buf or ""
  dest_party_tab.lastContent.EnableExportBuffs = dest_party_tab.enableExportBuffs
  if dest_party_tab.controls.ShowAdvanceTools then
    dest_party_tab.lastContent.showAdvancedTools = dest_party_tab.controls.ShowAdvanceTools.state
  end
end

local function rebuild_party_tab_actor_from_controls(dest_party_tab)
  dest_party_tab.actor = {
    Aura = {},
    Curse = {},
    Warcry = {},
    Link = {},
    modDB = new("ModDB"):ModDB(),
    output = {},
  }
  dest_party_tab.actor.modDB.actor = dest_party_tab.actor
  dest_party_tab.enemyModList = new("ModList"):ModList()

  dest_party_tab:ParseBuffs(dest_party_tab.actor["modDB"], dest_party_tab.controls.editPartyMemberStats.buf or "", "PartyMemberStats", dest_party_tab.actor["output"])
  dest_party_tab:ParseBuffs(dest_party_tab.actor["Aura"], dest_party_tab.controls.editAuras.buf or "", "Aura", dest_party_tab.controls.simpleAuras)
  dest_party_tab:ParseBuffs(dest_party_tab.actor["Curse"], dest_party_tab.controls.editCurses.buf or "", "Curse", dest_party_tab.controls.simpleCurses)
  dest_party_tab:ParseBuffs(dest_party_tab.actor["Warcry"], dest_party_tab.controls.editWarcries.buf or "", "Warcry", dest_party_tab.controls.simpleWarcries)
  dest_party_tab:ParseBuffs(dest_party_tab.actor["Link"], dest_party_tab.controls.editLinks.buf or "", "Link", dest_party_tab.controls.simpleLinks)
  dest_party_tab:ParseBuffs(dest_party_tab.enemyModList, dest_party_tab.controls.enemyCond.buf or "", "EnemyConditions")
  dest_party_tab:ParseBuffs(dest_party_tab.enemyModList, dest_party_tab.controls.enemyMods.buf or "", "EnemyMods", dest_party_tab.controls.simpleEnemyMods)
end

local function apply_collected_party_buffs_to_tab(collected, dest_party_tab, label)
  if #collected == 0 then return 0, {} end

  if not dest_party_tab then
    stderr_print(tostring(label or "Build") .. " partyTab not available")
    return 0, {}
  end

  local aggregated = {
    Aura = "",
    Curse = "",
    Warcry = "",
    Link = "",
    PartyMemberStats = "",
    EnemyConditions = "",
    EnemyMods = "",
  }

  local applied = 0
  for _, item in ipairs(collected) do
    if collected_buffs_have_any_content(item.buffs) then
      applied = applied + 1
    end
    aggregated.Aura = append_party_buffer_segment(aggregated.Aura, item.buffs and item.buffs.Aura)
    aggregated.Curse = append_party_buffer_segment(aggregated.Curse, item.buffs and item.buffs.Curse)
    aggregated.Warcry = append_party_buffer_segment(aggregated.Warcry, item.buffs and item.buffs.Warcry)
    aggregated.Link = append_party_buffer_segment(aggregated.Link, item.buffs and item.buffs.Link)
    aggregated.PartyMemberStats = append_party_buffer_segment(aggregated.PartyMemberStats, item.buffs and item.buffs.PartyMemberStats)
    aggregated.EnemyConditions = append_party_buffer_segment(aggregated.EnemyConditions, item.buffs and item.buffs.EnemyConditions)
    aggregated.EnemyMods = append_party_buffer_segment(aggregated.EnemyMods, item.buffs and item.buffs.EnemyMods)
  end

  if dest_party_tab.controls then
    stderr_print("[party] syncing collected buffs into party tab controls before rebuild")
    sync_party_tab_controls(dest_party_tab, aggregated)
    rebuild_party_tab_actor_from_controls(dest_party_tab)
  else
    dest_party_tab.enemyModList = dest_party_tab.enemyModList or new("ModList"):ModList()
    dest_party_tab.actor = dest_party_tab.actor or { Aura = {}, Curse = {}, Warcry = {}, Link = {}, modDB = new("ModDB"):ModDB(), output = {} }
    dest_party_tab.actor.modDB = dest_party_tab.actor.modDB or new("ModDB"):ModDB()
    dest_party_tab.actor.modDB.actor = dest_party_tab.actor
  end

  local effects = read_party_tab_effects(dest_party_tab)
  return applied, effects
end

-- Applies pre-collected party buff tables to the current build's partyTab.
-- Call this after main:SetMode has loaded the main build.
-- Returns applied count + effects snapshot for the summary.
local function apply_precollected_party_buffs(collected)
  return apply_collected_party_buffs_to_tab(collected, build and build.partyTab, "Main build")
end

local function initialize_stage_context(build_target, target_stage, character_snapshot)
  local raw_xml = strip_party_section_from_xml(build_target.raw_xml)
  if not raw_xml then
    error("Build target raw_xml is required.")
  end
  local build_name = trim(build_target.name) or "Imported Build"

  main:SetMode("BUILD", false, build_name, raw_xml, true)
  runCallback("OnFrame")
  runCallback("OnFrame")

  local resolved_tree_spec_id = select_tree_spec(as_table(target_stage.tree_spec))
  local resolved_item_set_id = resolve_item_set(as_table(target_stage.item_set))
  local resolved_skill_set_id = resolve_skill_set(as_table(target_stage.skill_set))
  local resolved_config_set_id, resolved_config_set_source = resolve_config_set(as_table(target_stage.config_set))
  local equipped_overlay_count = apply_character_overlay(character_snapshot)
  -- Apply party buffs only after the selected tree/item/skill loadouts and live
  -- character overlay are in place, then force one rebuild so mainOutput reflects
  -- the fully assembled state before baseline metrics are sampled.
  local applied_party_count, party_effects = apply_precollected_party_buffs(precollected_party_buffs)
  rebuild_current_build()
  sync_main_skill_minion_stats_toggle()

  local active_item_set = build.itemsTab and build.itemsTab.itemSets[build.itemsTab.activeItemSetId] or nil
  local active_skill_set = build.skillsTab and build.skillsTab.skillSets[build.skillsTab.activeSkillSetId] or nil
  local active_tree_spec = build.treeTab and build.treeTab.specList[build.treeTab.activeSpec] or nil
  local active_config_set = build.configTab and build.configTab.configSets and build.configTab.configSets[build.configTab.activeConfigSetId] or nil

  return {
    resolved_tree_spec_id = resolved_tree_spec_id,
    resolved_item_set_id = resolved_item_set_id,
    resolved_skill_set_id = resolved_skill_set_id,
    resolved_config_set_id = resolved_config_set_id,
    resolved_config_set_source = resolved_config_set_source,
    equipped_overlay_count = equipped_overlay_count,
    applied_party_count = applied_party_count,
    party_effects = party_effects,
    active_item_set = active_item_set,
    active_skill_set = active_skill_set,
    active_tree_spec = active_tree_spec,
    active_config_set = active_config_set,
    configuration_selection = collect_configuration_selection(
      active_config_set,
      resolved_config_set_id,
      resolved_config_set_source
    ),
    configuration_insights = collect_configuration_insights(active_config_set),
  }
end

local function normalize_metric_key(value)
  return trim(value) or "totalDps"
end

local function normalize_slot_match_key(value)
  local slot_name = normalize_key(value)
  if not slot_name then
    return nil
  end

  if slot_name == "helm" or slot_name == "helmet" then
    return "helmet"
  end

  if slot_name == "body armour" or slot_name == "bodyarmour" or slot_name == "chest" then
    return "body armour"
  end

  if slot_name == "ring" or slot_name == "ring 1" or slot_name == "ring1" then
    return "ring 1"
  end

  if slot_name == "ring 2" or slot_name == "ring2" then
    return "ring 2"
  end

  if slot_name == "weapon" or slot_name == "weapon 1" or slot_name == "weapon1" then
    return "weapon 1"
  end

  if slot_name == "offhand" or slot_name == "weapon 2" or slot_name == "weapon2" then
    return "weapon 2"
  end

  if slot_name == "weapon 1 swap" or slot_name == "weapon1swap" then
    return "weapon 1 swap"
  end

  if slot_name == "weapon 2 swap" or slot_name == "weapon2swap" then
    return "weapon 2 swap"
  end

  if slot_name == "gloves" or slot_name == "boots" or slot_name == "amulet" or slot_name == "belt" then
    return slot_name
  end

  return slot_name
end

local function build_market_price_lookup(market_candidates)
  local by_name = {}
  for _, entry in ipairs(as_table(market_candidates)) do
    local entry_name = normalize_key(entry and entry.name)
    if entry_name then
      local current = by_name[entry_name]
      local entry_price = safe_number(entry and entry.chaos_value)
      if entry_price and (not current or entry_price < current.chaos_value) then
        by_name[entry_name] = {
          name = trim(entry.name),
          base_type = trim(entry.base_type),
          chaos_value = entry_price,
          icon = trim(entry.icon),
          league = trim(entry.league),
        }
      end
    end
  end
  return by_name
end

local get_min_links_for_slot

local function find_market_unique_candidate(market_candidates, unique_name, slot_name, hard_requirements)
  local unique_name_key = normalize_key(unique_name)
  if not unique_name_key then
    return nil
  end

  local minimum_links = get_min_links_for_slot(hard_requirements, slot_name) or 0
  local best = nil

  for _, entry in ipairs(as_table(market_candidates)) do
    if normalize_key(entry and entry.name) == unique_name_key then
      local entry_price = safe_number(entry and entry.chaos_value)
      local entry_links = safe_number(entry and entry.links) or 0
      if entry_price and (minimum_links <= 0 or entry_links >= minimum_links) then
        if not best or entry_price < best.chaos_value then
          best = {
            name = trim(entry.name),
            base_type = trim(entry.base_type),
            chaos_value = entry_price,
            icon = trim(entry.icon),
            league = trim(entry.league),
            variant = trim(entry.variant),
            links = entry_links > 0 and entry_links or nil,
            details_id = trim(entry.details_id),
            price_source = trim(entry.price_source),
          }
        end
      end
    end
  end

  if best then
    return best
  end

  for _, entry in ipairs(as_table(market_candidates)) do
    if normalize_key(entry and entry.name) == unique_name_key then
      local entry_price = safe_number(entry and entry.chaos_value)
      local entry_links = safe_number(entry and entry.links) or 0
      if entry_price and (not best or entry_price < best.chaos_value) then
        best = {
          name = trim(entry.name),
          base_type = trim(entry.base_type),
          chaos_value = entry_price,
          icon = trim(entry.icon),
          league = trim(entry.league),
          variant = trim(entry.variant),
          links = minimum_links > 0
            and math.max(entry_links, minimum_links)
            or (entry_links > 0 and entry_links or nil),
          details_id = trim(entry.details_id),
          price_source = trim(entry.price_source),
        }
      end
    end
  end

  return best
end

local unique_db_by_title = nil

local function get_unique_db_index()
  if unique_db_by_title then
    return unique_db_by_title
  end

  unique_db_by_title = {}
  for _, item in pairs(main.uniqueDB.list or {}) do
    local title_key = normalize_key(item and item.title)
    if title_key then
      unique_db_by_title[title_key] = unique_db_by_title[title_key] or {}
      table.insert(unique_db_by_title[title_key], item)
    end
  end
  return unique_db_by_title
end

local function find_unique_template(unique_name, base_type)
  local title_key = normalize_key(unique_name)
  if not title_key then
    return nil
  end

  local matches = get_unique_db_index()[title_key]
  if not matches or #matches == 0 then
    return nil
  end

  local base_type_key = normalize_key(base_type)
  if base_type_key then
    for _, item in ipairs(matches) do
      if normalize_key(item and item.baseName) == base_type_key then
        return item
      end
    end
  end

  return matches[1]
end

local function build_required_unique_lookup(hard_requirements)
  local lookup = {}
  for _, requirement in ipairs(as_table(hard_requirements)) do
    if requirement and requirement.kind == "mandatory_unique" then
      local name_key = normalize_key(requirement.item_name or requirement.label)
      if name_key then
        lookup[name_key] = true
      end
    end
  end
  return lookup
end

local function is_unique_equipped_in_slot(character_snapshot, slot_name, unique_name)
  local wanted_slot = normalize_slot_match_key(slot_name)
  local wanted_name = normalize_key(unique_name)
  if not wanted_slot or not wanted_name then
    return false
  end

  for _, item in ipairs(as_table(character_snapshot.equipped_items)) do
    if normalize_slot_match_key(item and item.stage_slot_hint or item and item.slot) == wanted_slot
      and normalize_key(item and item.name) == wanted_name then
      return true
    end
  end

  return false
end

local function is_unique_equipped_anywhere(character_snapshot, unique_name)
  local wanted_name = normalize_key(unique_name)
  if not wanted_name then
    return false
  end

  for _, item in ipairs(as_table(character_snapshot.equipped_items)) do
    if normalize_key(item and item.name) == wanted_name then
      return true
    end
  end

  return false
end

local function get_equipped_item_in_slot(character_snapshot, slot_name)
  local wanted_slot = normalize_slot_match_key(slot_name)
  if not wanted_slot then
    return nil
  end

  for _, item in ipairs(as_table(character_snapshot.equipped_items)) do
    if normalize_slot_match_key(item and item.stage_slot_hint or item and item.slot) == wanted_slot then
      return item
    end
  end

  return nil
end

local function normalize_item_text(value)
  if type(value) ~= "string" then
    return nil
  end

  local lines = {}
  for line in value:gmatch("[^\r\n]+") do
    local normalized_line = trim(line)
    if normalized_line then
      table.insert(lines, normalized_line)
    end
  end

  if #lines == 0 then
    return nil
  end

  return table.concat(lines, "\n")
end

local function is_same_item_text(left_text, right_text)
  local left_normalized = normalize_item_text(left_text)
  local right_normalized = normalize_item_text(right_text)
  return left_normalized and right_normalized and left_normalized == right_normalized or false
end

function build_compare_power_stat(primary_metric)
  local metric = normalize_key(primary_metric) or "totaldps"
  if metric == "totalehp" then
    return { stat = "TotalEHP", label = "Effective Hit Pool", fmt = ".0f" }
  end
  if metric == "combineddps" then
    return { stat = "CombinedDPS", label = "Combined DPS", fmt = ".0f" }
  end
  if metric == "fulldps" then
    return { stat = "FullDPS", label = "Full DPS", fmt = ".0f" }
  end
  if metric == "totaldps" then
    return { stat = "TotalDPS", label = "Hit DPS", fmt = ".0f" }
  end
  return { stat = "TotalDPS", label = "Hit DPS", fmt = ".0f" }
end

function collect_current_tree_node_set(character_snapshot)
  local set = {}
  local passive_tree = as_table(character_snapshot and character_snapshot.passive_tree)
  for _, node_id in ipairs(as_table(passive_tree.hashes)) do
    local numeric_id = tonumber(node_id)
    if numeric_id then
      set[numeric_id] = true
    end
  end
  for _, node_id in ipairs(as_table(passive_tree.hashesEx)) do
    local numeric_id = tonumber(node_id)
    if numeric_id then
      set[numeric_id] = true
    end
  end
  return set
end

function calculate_compare_impact(calcs_tab, power_stat, output, baseline_output)
  if not output or not baseline_output then
    return nil
  end

  if calcs_tab and calcs_tab.CalculatePowerStat then
    local ok, value = pcall(function()
      return calcs_tab:CalculatePowerStat(power_stat, output, baseline_output)
    end)
    if ok then
      return safe_number(value)
    end
  end

  return (safe_number(output[power_stat.stat]) or 0) - (safe_number(baseline_output[power_stat.stat]) or 0)
end

function new_compare_diagnostics()
  return {
    tree = {
      candidates = 0,
      attempted = 0,
      rows = 0,
      zero_impact = 0,
      calc_errors = 0,
      skipped_already_current = 0,
      skipped_missing_node = 0,
      skipped_unsupported_node = 0,
      skipped_ascendancy = 0,
      skipped_empty_mod_key = 0,
      examples = {},
    },
    items = {
      candidates = 0,
      attempted = 0,
      rows = 0,
      zero_impact = 0,
      calc_errors = 0,
      skipped_missing_slot_or_raw_text = 0,
      skipped_same_as_current = 0,
      examples = {},
    },
  }
end

function add_compare_example(bucket, example)
  if bucket and bucket.examples and #bucket.examples < 8 then
    table.insert(bucket.examples, example)
  end
end

function normalize_pob_item_rarity(value)
  local rarity = normalize_key(value)
  if rarity == "rare" then
    return "RARE"
  end
  if rarity == "magic" then
    return "MAGIC"
  end
  if rarity == "normal" then
    return "NORMAL"
  end
  if rarity == "unique" then
    return "UNIQUE"
  end
  if rarity == "relic" then
    return "RELIC"
  end
  return nil
end

function parse_pob_item_rarity(raw_text)
  local raw = trim(raw_text)
  if not raw then
    return nil
  end
  for line in raw:gmatch("[^\r\n]+") do
    local rarity = line:match("^%s*Rarity:%s*(.+)%s*$")
    if rarity then
      return trim(rarity)
    end
  end
  return nil
end

function get_compare_calculator()
  local ok, calcs_module = pcall(function()
    return LoadModule("Modules/Calcs")
  end)
  if ok and calcs_module and calcs_module.getMiscCalculator then
    local calc_ok, calc_func, baseline_output = pcall(function()
      return calcs_module.getMiscCalculator(build)
    end)
    if calc_ok then
      return calc_func, baseline_output
    end
  end
  if build and build.calcsTab and build.calcsTab.GetMiscCalculator then
    local calc_ok, calc_func, baseline_output = pcall(function()
      return build.calcsTab:GetMiscCalculator()
    end)
    if calc_ok then
      return calc_func, baseline_output
    end
  end
  return nil, nil
end

function set_import_clear_option(control, state)
  if control then
    control.state = state
  end
end

function import_live_character_into_current_build(character_snapshot)
  local current_import = as_table(character_snapshot and character_snapshot.current_import)
  local char_data = current_import.character
  local imported_items = false
  local imported_tree = false
  local import_errors = {}
  if not build or not build.importTab or type(char_data) ~= "table" then
    error("Current character import failed: character data unavailable")
  end
  local ok, result = pcall(function()
    return build.importTab:ImportItemsAndSkills(char_data, true, true, false)
  end)
  if ok and result then
    imported_items = true
  else
    table.insert(import_errors, "items:" .. tostring(result))
  end
  local tree_ok, tree_err = pcall(function()
    build.importTab:ImportPassiveTreeAndJewels(char_data, true)
  end)
  if tree_ok then
    imported_tree = true
  else
    table.insert(import_errors, "tree:" .. tostring(tree_err))
  end
  if not imported_items or not imported_tree then
    error("Current character import failed: " .. table.concat(import_errors, "; "))
  end
  if not as_table(current_import.completeness).wickerman then
    add_warning("Current character source does not establish Wickerman completeness; comparison is incomplete.")
    table.insert(import_errors, "wickerman_source_incomplete")
  end

  rebuild_current_build()
  sync_main_skill_minion_stats_toggle()

  return {
    imported_items = imported_items,
    imported_tree = imported_tree,
    errors = import_errors,
    completeness = current_import.completeness,
  }
end

function select_highest_dps_main_socket_group()
  if not build or not build.skillsTab or not build.calcsTab then
    return nil
  end

  local original_main = build.mainSocketGroup or 1
  local original_skill_number = build.calcsTab.input and build.calcsTab.input.skill_number or original_main
  local best_index = original_main
  local best_dps = -1

  for index, socket_group in ipairs(as_table(build.skillsTab.socketGroupList)) do
    if socket_group and socket_group.enabled ~= false and socket_group.displaySkillList and #socket_group.displaySkillList > 0 then
      build.mainSocketGroup = index
      build.calcsTab.input.skill_number = index
      if socket_group.mainActiveSkillCalcs == nil then
        socket_group.mainActiveSkillCalcs = socket_group.mainActiveSkill or 1
      end
      rebuild_current_build()
      local output = build.calcsTab and build.calcsTab.mainOutput or nil
      local dps = safe_number(output and output.TotalDPS) or safe_number(output and output.CombinedDPS) or 0
      if dps > best_dps then
        best_dps = dps
        best_index = index
      end
    end
  end

  build.mainSocketGroup = best_index
  build.calcsTab.input.skill_number = best_index
  local best_group = as_table(build.skillsTab.socketGroupList)[best_index]
  if best_group and best_group.mainActiveSkillCalcs == nil then
    best_group.mainActiveSkillCalcs = best_group.mainActiveSkill or 1
  end
  rebuild_current_build()
  stderr_print(string.format(
    "[compare] selected current main socket group=%s dps=%.0f previous=%s calcs=%s",
    tostring(best_index),
    best_dps,
    tostring(original_main),
    tostring(original_skill_number)
  ))

  return best_index
end

function initialize_current_compare_context(build_target, character_snapshot)
  local raw_xml = strip_party_section_from_xml(build_target.raw_xml)
  if not raw_xml then
    error("Build target raw_xml is required.")
  end

  main:SetMode("BUILD", false, "Current Character", raw_xml, true)
  runCallback("OnFrame")
  runCallback("OnFrame")

  local import_result = import_live_character_into_current_build(character_snapshot)
  select_highest_dps_main_socket_group()
  ensure_main_skill_max_stages()
  local applied_party_count, party_effects = apply_precollected_party_buffs(precollected_party_buffs)
  rebuild_current_build()
  sync_main_skill_minion_stats_toggle()

  return {
    import_result = import_result,
    applied_party_count = applied_party_count,
    party_effects = party_effects,
    active_item_set = build.itemsTab and build.itemsTab.itemSets[build.itemsTab.activeItemSetId] or nil,
    active_skill_set = build.skillsTab and build.skillsTab.skillSets[build.skillsTab.activeSkillSetId] or nil,
    active_tree_spec = build.treeTab and build.treeTab.specList[build.treeTab.activeSpec] or nil,
    active_config_set = build.configTab and build.configTab.configSets and build.configTab.configSets[build.configTab.activeConfigSetId] or nil,
  }
end

function select_target_sets_for_compare_entry(compare_entry, target_stage)
  local original_build = build
  build = compare_entry
  local ok, result_or_error = xpcall(function()
    local resolved_tree_spec_id = select_tree_spec(as_table(target_stage.tree_spec))
    local resolved_item_set_id = resolve_item_set(as_table(target_stage.item_set))
    local resolved_skill_set_id = resolve_skill_set(as_table(target_stage.skill_set))
    local resolved_config_set_id, resolved_config_set_source = resolve_config_set(as_table(target_stage.config_set))
    return {
      resolved_tree_spec_id = resolved_tree_spec_id,
      resolved_item_set_id = resolved_item_set_id,
      resolved_skill_set_id = resolved_skill_set_id,
      resolved_config_set_id = resolved_config_set_id,
      resolved_config_set_source = resolved_config_set_source,
    }
  end, function(err)
    return debug.traceback(err, 2)
  end)
  build = original_build

  if compare_entry and compare_entry.Rebuild then
    compare_entry:Rebuild()
  end

  if not ok then
    return nil, result_or_error
  end

  return result_or_error, nil
end

function normalize_upstream_compare_category(category)
  local normalized = normalize_key(category)
  if normalized == "tree" then
    return "tree_node", "passive_node"
  end
  if normalized == "item" then
    return "item", "gear_item"
  end
  if normalized == "skill gem" or normalized == "skillgem" then
    return "skill_gem", "skill_gem"
  end
  if normalized == "support gem" or normalized == "supportgem" then
    return "support_gem", "support_gem"
  end
  if normalized == "config" then
    return "config", "config_change"
  end
  return tostring(category or "unknown"), nil
end

function compare_action_type_to_candidate_type(action_type)
  if action_type == "passive_node" then
    return "compare_passive_node"
  end
  if action_type == "skill_gem" then
    return "compare_skill_gem"
  end
  if action_type == "support_gem" then
    return "compare_support_gem"
  end
  if action_type == "config_change" then
    return "compare_config_change"
  end
  if action_type == "reservation_fix" then
    return "compare_reservation_fix"
  end
  return "compare_gear_item"
end

function compare_action_type_to_slot(action_type, row)
  if action_type == "passive_node" then
    return "Passive Tree"
  end
  if action_type == "skill_gem" then
    return "Skill Gems"
  end
  if action_type == "support_gem" then
    return "Support Gems"
  end
  if action_type == "config_change" then
    return "Configuration"
  end
  return trim(row and row.slot)
end

function compare_action_type_to_title_prefix(action_type)
  if action_type == "passive_node" then
    return "Allocate target passive: "
  end
  if action_type == "skill_gem" then
    return "Add target skill setup: "
  end
  if action_type == "support_gem" then
    return "Add target support gem: "
  end
  if action_type == "config_change" then
    return "Apply target config: "
  end
  return "Use target item: "
end

function normalize_upstream_compare_row(entry)
  local category, action_type = normalize_upstream_compare_category(entry and entry.category)
  if not action_type then
    return nil
  end

  local name = trim(entry.name) or tostring(entry.category or "Compare action")
  local slot = trim(entry.slotName)
  if action_type == "gear_item" and not slot then
    local parsed_name, parsed_slot = name:match("^(.-),%s*(.+)$")
    if parsed_name and parsed_slot then
      name = trim(parsed_name) or name
      slot = trim(parsed_slot)
    end
  end

  local source_key = action_type .. ":" .. tostring(
    safe_number(entry.nodeId)
      or normalize_key(slot or name)
      or name
  )

  return {
    category = category,
    action_type = action_type,
    name = name,
    slot = slot,
    source_key = source_key,
    node_id = safe_number(entry.nodeId),
    impact = safe_number(entry.impact) or 0,
    impact_percent = safe_number(entry.impactPercent),
    path_distance = safe_number(entry.pathDist),
    per_point = safe_number(entry.perPoint),
    rarity = trim(entry.itemObj and entry.itemObj.rarity)
      or parse_pob_item_rarity(entry.itemObj and entry.itemObj.raw),
    raw_text = trim(entry.itemObj and entry.itemObj.raw),
    current_side = "live_character",
    target_side = "target_stage",
  }
end

function normalize_upstream_compare_results(results)
  local rows = {}
  local counts = {}
  for _, entry in ipairs(as_table(results)) do
    local row = normalize_upstream_compare_row(entry)
    if row and math.abs(safe_number(row.impact) or 0) > 0.001 then
      table.insert(rows, row)
      counts[row.action_type] = (counts[row.action_type] or 0) + 1
    end
  end
  table.sort(rows, function(left, right)
    local left_abs = math.abs(safe_number(left and left.impact) or 0)
    local right_abs = math.abs(safe_number(right and right.impact) or 0)
    if left_abs ~= right_abs then
      return left_abs > right_abs
    end
    return tostring(left and left.name or "") < tostring(right and right.name or "")
  end)
  return rows, counts
end

function build_upstream_compare_report_from_tab(compare_tab, compare_entry, power_stat, current_context, selection)
  compare_tab.comparePowerResults = {}
  stderr_print(string.format(
    "[compare] running upstream Compare Power stat=%s label=%s",
    tostring(power_stat and power_stat.stat),
    tostring(power_stat and power_stat.label)
  ))
  compare_tab:ComparePowerBuilder(compare_entry, power_stat, {
    treeNodes = true,
    items = true,
    skillGems = true,
    supportGems = true,
    config = true,
  })

  local rows, counts = normalize_upstream_compare_results(compare_tab.comparePowerResults)
  return {
    version = 3,
    available = true,
    source = "upstream_compare_power_report",
    metric = power_stat.stat,
    metric_label = power_stat.label,
    row_count = #rows,
    action_type_counts = counts,
    current_import = current_context.import_result,
    selection = selection,
    diagnostics = {
      current_side = "live_character",
      target_side = "target_stage",
      config_current_source = "build_target_baseline_config",
      upstream_row_count = #(as_table(compare_tab.comparePowerResults)),
    },
    rows = rows,
  }
end

function attach_secondary_compare_impacts(primary_report, secondary_report, secondary_metric_key)
  if not primary_report or not secondary_report or secondary_report.available ~= true then
    return
  end

  local by_key = {}
  for _, row in ipairs(as_table(secondary_report.rows)) do
    local source_key = trim(row and row.source_key)
    if source_key then
      by_key[source_key] = row
    end
  end

  for _, row in ipairs(as_table(primary_report.rows)) do
    local source_key = trim(row and row.source_key)
    local secondary_row = source_key and by_key[source_key] or nil
    if secondary_row then
      row.secondary_impacts = as_table(row.secondary_impacts)
      row.secondary_impacts[secondary_metric_key] = {
        metric = secondary_report.metric,
        metric_key = secondary_metric_key,
        metric_label = secondary_report.metric_label,
        impact = safe_number(secondary_row.impact) or 0,
        impact_percent = safe_number(secondary_row.impact_percent),
      }
    end
  end
end

function build_upstream_compare_power_report(build_target, target_stage, character_snapshot)
  local current_context = initialize_current_compare_context(build_target, character_snapshot)
  local current_metrics = collect_metrics()
  local power_stat = build_compare_power_stat(target_stage and target_stage.primary_metric)
  local ok_classes = detect_compare_capability()
  if not ok_classes then
    return nil, current_context, current_metrics, "compare_classes_unavailable"
  end

  local raw_xml = strip_party_section_from_xml(build_target.raw_xml)
  local compare_entry = new("CompareEntry"):CompareEntry(raw_xml, trim(as_table(target_stage).label) or "Target Stage")
  local selection, selection_error = select_target_sets_for_compare_entry(compare_entry, target_stage)
  if selection_error then
    return nil, current_context, current_metrics, selection_error
  end

  local compare_tab = new("CompareTab"):CompareTab(build)
  local primary_report = build_upstream_compare_report_from_tab(
    compare_tab,
    compare_entry,
    power_stat,
    current_context,
    selection
  )
  local reports = {
    primary = primary_report,
  }

  if power_stat.stat ~= "TotalEHP" then
    local ehp_stat = build_compare_power_stat("totalEhp")
    local ehp_report = build_upstream_compare_report_from_tab(
      compare_tab,
      compare_entry,
      ehp_stat,
      current_context,
      selection
    )
    reports.effective_hit_pool = ehp_report
    attach_secondary_compare_impacts(primary_report, ehp_report, "totalEhp")
  end

  return primary_report, current_context, current_metrics, nil, reports
end

function append_compare_power_tree_rows(rows, calc_func, baseline_output, power_stat, character_snapshot, diagnostics)
  local spec = build and build.spec or nil
  local tree_nodes = spec and (spec.nodes or spec.tree and spec.tree.nodes) or nil
  local target_alloc_nodes = as_table(spec and spec.allocNodes)
  if not calc_func or not tree_nodes then
    return 0, 0
  end

  local current_node_set = collect_current_tree_node_set(character_snapshot)
  local evaluated = 0
  local attempted = 0
  for node_id, allocated in pairs(target_alloc_nodes) do
    if diagnostics then
      diagnostics.tree.candidates = diagnostics.tree.candidates + 1
    end
    if attempted >= MAX_COMPARE_POWER_TREE_ROWS then
      break
    end
    local numeric_id = tonumber(node_id)
    local node = numeric_id and tree_nodes[numeric_id] or nil
    local node_type = node and (node.type or (node.isKeystone and "Keystone" or nil)) or nil
    if not allocated then
      -- Alloc table should only contain allocated nodes in current PoB, but keep
      -- this branch for older/spec variants without reporting noise.
    elseif not numeric_id or not node then
      if diagnostics then
        diagnostics.tree.skipped_missing_node = diagnostics.tree.skipped_missing_node + 1
      end
    elseif current_node_set[numeric_id] then
      if diagnostics then
        diagnostics.tree.skipped_already_current = diagnostics.tree.skipped_already_current + 1
      end
    elseif node.ascendancyName then
      if diagnostics then
        diagnostics.tree.skipped_ascendancy = diagnostics.tree.skipped_ascendancy + 1
      end
    elseif node.modKey == "" then
      if diagnostics then
        diagnostics.tree.skipped_empty_mod_key = diagnostics.tree.skipped_empty_mod_key + 1
      end
    elseif not (node_type == "Normal" or node_type == "Notable" or node_type == "Keystone") then
      if diagnostics then
        diagnostics.tree.skipped_unsupported_node = diagnostics.tree.skipped_unsupported_node + 1
      end
    else
      attempted = attempted + 1
      if diagnostics then
        diagnostics.tree.attempted = attempted
      end
      local remove_nodes = { [node] = true, [numeric_id] = true }
      local ok, output = pcall(function()
        return calc_func({ removeNodes = remove_nodes }, power_stat.stat == "FullDPS")
      end)
      if ok and output then
        local removed_delta = calculate_compare_impact(build.calcsTab, power_stat, output, baseline_output)
        local impact = removed_delta and -removed_delta or nil
        if impact and math.abs(impact) > 0.001 then
          local path_distance = safe_number(node.pathDist)
          if not path_distance or path_distance <= 0 then
            path_distance = #(node.path or {})
            if path_distance <= 0 then
              path_distance = 1
            end
          end
          table.insert(rows, {
            category = "tree_node",
            action_type = "passive_node",
            name = trim(node.dn or node.name) or tostring(numeric_id),
            node_id = numeric_id,
            source_key = "passive_node:" .. tostring(numeric_id),
            impact = impact,
            impact_percent = (safe_number(baseline_output[power_stat.stat]) or 0) ~= 0
              and (impact / math.abs(safe_number(baseline_output[power_stat.stat]) or 1) * 100)
              or nil,
            path_distance = path_distance,
              per_point = impact / path_distance,
            })
          evaluated = evaluated + 1
          if diagnostics then
            diagnostics.tree.rows = evaluated
          end
        else
          if diagnostics then
            diagnostics.tree.zero_impact = diagnostics.tree.zero_impact + 1
            add_compare_example(diagnostics.tree, {
              reason = "zero_impact",
              node_id = numeric_id,
              name = trim(node.dn or node.name) or tostring(numeric_id),
              impact = impact or 0,
            })
          end
        end
      else
        if diagnostics then
          diagnostics.tree.calc_errors = diagnostics.tree.calc_errors + 1
          add_compare_example(diagnostics.tree, {
            reason = "calc_error",
            node_id = numeric_id,
            name = trim(node and (node.dn or node.name)) or tostring(numeric_id),
            error = tostring(output),
          })
        end
      end
    end
  end
  return evaluated, attempted
end

function append_compare_power_item_rows(rows, calc_func, baseline_output, power_stat, target_stage, character_snapshot, diagnostics)
  local item_set = as_table(target_stage and target_stage.item_set)
  local stage_items = as_table(item_set.items)
  if not calc_func or #stage_items == 0 then
    return 0
  end

  local evaluated = 0
  local attempted = 0
  for _, stage_item in ipairs(stage_items) do
    if diagnostics then
      diagnostics.items.candidates = diagnostics.items.candidates + 1
    end
    if attempted >= MAX_COMPARE_POWER_ITEM_ROWS then
      break
    end
    local slot_name = trim(stage_item and stage_item.slot)
    local raw_text = trim(stage_item and stage_item.raw_text)
    if not slot_name or not raw_text then
      if diagnostics then
        diagnostics.items.skipped_missing_slot_or_raw_text = diagnostics.items.skipped_missing_slot_or_raw_text + 1
        add_compare_example(diagnostics.items, {
          reason = "missing_slot_or_raw_text",
          slot = slot_name,
          name = trim(stage_item and stage_item.name) or trim(stage_item and stage_item.type_line),
        })
      end
    else
      local current_item = get_equipped_item_in_slot(character_snapshot, slot_name)
      if is_same_item_text(current_item and current_item.pob_item_text, raw_text) then
        if diagnostics then
          diagnostics.items.skipped_same_as_current = diagnostics.items.skipped_same_as_current + 1
        end
      else
        attempted = attempted + 1
        if diagnostics then
          diagnostics.items.attempted = attempted
        end
        local ok, output = pcall(function()
          local item_rarity = normalize_pob_item_rarity(stage_item and stage_item.rarity)
          local item = new("Item"):Item(raw_text, item_rarity, true)
          if item.NormaliseQuality then
            item:NormaliseQuality()
          end
          if item.BuildAndParseRaw then
            item:BuildAndParseRaw()
          end
          return calc_func({ repSlotName = slot_name, repItem = item }, power_stat.stat == "FullDPS")
        end)
        if ok and output then
          local impact = calculate_compare_impact(build.calcsTab, power_stat, output, baseline_output)
          if impact and math.abs(impact) > 0.001 then
            table.insert(rows, {
              category = normalize_key(slot_name):find("jewel", 1, true) and "jewel" or "item",
              action_type = "gear_item",
              name = trim(stage_item.name) or trim(stage_item.type_line) or slot_name,
              slot = slot_name,
              source_key = "gear_item:" .. tostring(normalize_slot_match_key(slot_name) or slot_name) .. ":" .. tostring(normalize_key(trim(stage_item.name) or trim(stage_item.type_line) or slot_name) or "target"),
              impact = impact,
              impact_percent = (safe_number(baseline_output[power_stat.stat]) or 0) ~= 0
                and (impact / math.abs(safe_number(baseline_output[power_stat.stat]) or 1) * 100)
                or nil,
              rarity = trim(stage_item.rarity) or parse_pob_item_rarity(raw_text),
              raw_text = raw_text,
            })
            evaluated = evaluated + 1
            if diagnostics then
              diagnostics.items.rows = evaluated
            end
          else
            if diagnostics then
              diagnostics.items.zero_impact = diagnostics.items.zero_impact + 1
              add_compare_example(diagnostics.items, {
                reason = "zero_impact",
                slot = slot_name,
                name = trim(stage_item.name) or trim(stage_item.type_line) or slot_name,
                impact = impact or 0,
              })
            end
          end
        else
          if diagnostics then
            diagnostics.items.calc_errors = diagnostics.items.calc_errors + 1
            add_compare_example(diagnostics.items, {
              reason = "calc_error",
              slot = slot_name,
              name = trim(stage_item and stage_item.name) or trim(stage_item and stage_item.type_line) or slot_name,
              error = tostring(output),
            })
          end
        end
      end
    end
  end
  return evaluated, attempted
end

function build_compare_power_report(target_stage, character_snapshot)
  local power_stat = build_compare_power_stat(target_stage and target_stage.primary_metric)
  local calc_func, baseline_output = get_compare_calculator()
  if not calc_func or not baseline_output then
    return {
      version = 2,
      available = false,
      reason = "misc_calculator_unavailable",
      metric = power_stat.stat,
      metric_label = power_stat.label,
      rows = {},
    }
  end

  local rows = {}
  local diagnostics = new_compare_diagnostics()
  local tree_count, tree_attempt_count = append_compare_power_tree_rows(rows, calc_func, baseline_output, power_stat, character_snapshot, diagnostics)
  local item_count, item_attempt_count = append_compare_power_item_rows(rows, calc_func, baseline_output, power_stat, target_stage, character_snapshot, diagnostics)

  table.sort(rows, function(left, right)
    local left_abs = math.abs(safe_number(left and left.impact) or 0)
    local right_abs = math.abs(safe_number(right and right.impact) or 0)
    if left_abs ~= right_abs then
      return left_abs > right_abs
    end
    return tostring(left and left.name or "") < tostring(right and right.name or "")
  end)

  stderr_print(string.format(
    "[compare] metric=%s rows=%d tree_attempted=%d tree_zero=%d tree_errors=%d item_attempted=%d item_zero=%d item_errors=%d",
    tostring(power_stat.stat),
    #rows,
    safe_number(diagnostics.tree.attempted) or tree_attempt_count or 0,
    safe_number(diagnostics.tree.zero_impact) or 0,
    safe_number(diagnostics.tree.calc_errors) or 0,
    safe_number(diagnostics.items.attempted) or item_attempt_count or 0,
    safe_number(diagnostics.items.zero_impact) or 0,
    safe_number(diagnostics.items.calc_errors) or 0
  ))

  return {
    version = 2,
    available = true,
    metric = power_stat.stat,
    metric_label = power_stat.label,
    row_count = #rows,
    evaluated_tree_node_count = tree_count,
    attempted_tree_node_count = tree_attempt_count,
    evaluated_item_count = item_count,
    attempted_item_count = item_attempt_count,
    diagnostics = diagnostics,
    rows = rows,
  }
end

function compare_stat_to_metric_key(stat)
  local normalized = normalize_key(stat)
  if normalized == "totaldps" then
    return "totalDps"
  end
  if normalized == "fulldps" then
    return "fullDps"
  end
  if normalized == "combineddps" then
    return "combinedDps"
  end
  if normalized == "totalehp" then
    return "totalEhp"
  end
  return "totalDps"
end

function copy_metrics_with_compare_delta(before_metrics, metric_key, impact)
  local after_metrics = shallow_copy(as_table(before_metrics))
  local before_value = safe_number(after_metrics[metric_key])
  local delta = safe_number(impact) or 0
  if before_value ~= nil then
    after_metrics[metric_key] = before_value + delta
  end
  return after_metrics
end

function get_compare_secondary_impact(row, metric_key)
  local impacts = as_table(row and row.secondary_impacts)
  local impact = impacts[metric_key]
  if type(impact) == "table" then
    return impact
  end
  return nil
end

function format_compare_delta(value)
  local numeric = safe_number(value) or 0
  local sign = numeric >= 0 and "+" or ""
  if math.abs(numeric) >= 100 then
    return sign .. tostring(math.floor(numeric + (numeric >= 0 and 0.5 or -0.5)))
  end
  return sign .. string.format("%.1f", numeric)
end

function create_compare_score_breakdown(primary_metric, impact, per_point)
  local primary_delta = safe_number(impact) or 0
  return {
    version = 2,
    primary_metric = primary_metric,
    compare_score = primary_delta,
    dps_score = primary_delta,
    ehp_score = 0,
    reservation_score = 0,
    per_point = safe_number(per_point),
  }
end

function compare_action_row_allowed(row)
  local action_type = trim(row and row.action_type)
  local impact = safe_number(row and row.impact) or 0
  local ehp_impact = safe_number(get_compare_secondary_impact(row, "totalEhp") and get_compare_secondary_impact(row, "totalEhp").impact) or 0
  if math.abs(impact) <= 0.001 and math.abs(ehp_impact) <= 0.001 then
    return false
  end
  if action_type == "passive_node"
    or action_type == "skill_gem"
    or action_type == "support_gem"
    or action_type == "config_change"
  then
    return impact > 0 or ehp_impact > 0
  end
  return action_type == "gear_item"
end

function create_compare_action_plan(row, compare_power_report, before_metrics)
  local action_type = trim(row and row.action_type)
  local metric_key = compare_stat_to_metric_key(compare_power_report and compare_power_report.metric)
  local impact = safe_number(row and row.impact) or 0
  local after_metrics = copy_metrics_with_compare_delta(before_metrics, metric_key, impact)
  local ehp_secondary = get_compare_secondary_impact(row, "totalEhp")
  local ehp_impact = safe_number(ehp_secondary and ehp_secondary.impact)
  if ehp_impact and metric_key ~= "totalEhp" then
    after_metrics = copy_metrics_with_compare_delta(after_metrics, "totalEhp", ehp_impact)
  end
  local score_breakdown = create_compare_score_breakdown(metric_key, impact, row and row.per_point)
  if ehp_impact then
    score_breakdown.ehp_score = ehp_impact
  end
  local metric_label = trim(compare_power_report and compare_power_report.metric_label) or metric_key
  local name = trim(row and row.name) or "Compare action"
  local slot_name = compare_action_type_to_slot(action_type, row)
  local source_key = trim(row and row.source_key)
  local stage_progress_score = (impact > 0 or (ehp_impact or 0) > 0) and 1.0 or 0.25
  local title = compare_action_type_to_title_prefix(action_type) .. name
  local summary = string.format(
    "%s %s from target %s.",
    metric_label,
    format_compare_delta(impact),
    slot_name or "action"
  )
  local explanation = "Path of Building Compare identified this action by comparing the target stage against the current character setup."
  local item_payload = {
    compare_source = true,
    compare_report_version = compare_power_report and compare_power_report.version or 2,
    action_type = action_type,
    source_key = source_key,
    candidate_type = compare_action_type_to_candidate_type(action_type),
    metric = compare_power_report and compare_power_report.metric,
    metric_key = metric_key,
    metric_label = metric_label,
    compare_impact = impact,
    compare_impact_percent = safe_number(row and row.impact_percent),
    compare_secondary_impacts = row and row.secondary_impacts,
    target_stage_slot = slot_name,
    raw_text = trim(row and row.raw_text),
    current_side = trim(row and row.current_side) or "live_character",
    target_side = trim(row and row.target_side) or "target_stage",
  }

  if action_type == "passive_node" then
    local node_id = safe_number(row and row.node_id)
    summary = string.format(
      "%s %s from target passive tree node%s.",
      metric_label,
      format_compare_delta(impact),
      node_id and (" " .. tostring(math.floor(node_id))) or ""
    )
    item_payload.node_id = node_id
    item_payload.path_distance = safe_number(row and row.path_distance)
    item_payload.per_point = safe_number(row and row.per_point)
    slot_name = "Passive Tree"
  elseif action_type == "skill_gem" or action_type == "support_gem" then
    item_payload.gem_name = name
  elseif action_type == "config_change" then
    item_payload.config_label = name
  elseif action_type == "gear_item" then
    item_payload.rarity = trim(row and row.rarity) or parse_pob_item_rarity(row and row.raw_text) or "Target"
  end

  if ehp_impact and metric_key ~= "totalEhp" then
    summary = string.format(
      "%s %s and Effective Hit Pool %s from target %s.",
      metric_label,
      format_compare_delta(impact),
      format_compare_delta(ehp_impact),
      slot_name or "action"
    )
  end

  return {
    category = "best_single",
    kind = "single",
    title = title,
    summary = summary,
    explanation = explanation,
    effective_cost_chaos = 0,
    ask_price_chaos = nil,
    score = impact,
    stage_progress_score = stage_progress_score,
    ranking_reason = {
      compare_source = true,
      candidate_type = item_payload.candidate_type,
      action_type = action_type,
      source_key = source_key,
      primary_metric = metric_key,
      primary_delta = impact,
      compare_impact_percent = safe_number(row and row.impact_percent),
      compare_secondary_impacts = row and row.secondary_impacts,
      total_ehp_delta = ehp_impact,
      target_stage_slot = slot_name,
      score_breakdown = score_breakdown,
    },
    before_metrics = before_metrics,
    after_metrics = after_metrics,
    breaks_requirements = false,
    section = "primary",
    items = {
      {
        source = "compare",
        slot = slot_name,
        item_name = name,
        item_payload = item_payload,
        trade_link = nil,
        ask_price_chaos = nil,
        effective_price_chaos = 0,
      },
    },
  }
end

function build_compare_action_plans(compare_power_report, before_metrics)
  if not compare_power_report or compare_power_report.available ~= true then
    return {}
  end

  local plans = {}
  for _, row in ipairs(as_table(compare_power_report.rows)) do
    if compare_action_row_allowed(row) then
      table.insert(plans, create_compare_action_plan(row, compare_power_report, before_metrics))
    end
  end

  table.sort(plans, function(left, right)
    return (safe_number(left and left.score) or 0) > (safe_number(right and right.score) or 0)
  end)

  return plans
end

local function url_encode(value)
  return (tostring(value or ""):gsub("([^%w%-_%.~])", function(char)
    return string.format("%%%02X", string.byte(char))
  end))
end

local function build_trade_link(league, item_name)
  local normalized_league = trim(league)
  local normalized_name = trim(item_name)
  if not normalized_league or not normalized_name then
    return nil
  end

  return "https://www.pathofexile.com/trade/search/" .. url_encode(normalized_league) .. "?q=" .. url_encode(normalized_name)
end

local trade_query_url_cache = {}

local function get_trade_stat_weights(primary_metric)
  local normalized_metric = normalize_key(primary_metric) or "totaldps"
  if normalized_metric == "totalehp" then
    return {
      { label = "Effective Hit Pool", stat = "TotalEHP", weightMult = 1.0 },
      { label = "Full DPS", stat = "FullDPS", weightMult = 0.35 },
    }
  end

  return {
    { label = "Full DPS", stat = "FullDPS", weightMult = 1.0 },
    { label = "Effective Hit Pool", stat = "TotalEHP", weightMult = 0.5 },
  }
end

local function is_meaningful_trade_link_requirement(slot_name, value)
  local normalized_slot = normalize_slot_match_key(slot_name)
  local normalized_value = safe_number(value) or 0
  if normalized_value < 6 then
    return false
  end

  return normalized_slot == "body armour"
    or normalized_slot == "weapon 1"
    or normalized_slot == "weapon 2"
end

get_min_links_for_slot = function(hard_requirements, slot_name)
  for _, requirement in ipairs(as_table(hard_requirements)) do
    if requirement
      and requirement.kind == "minimum_links"
      and normalize_slot_match_key(requirement.slot) == normalize_slot_match_key(slot_name)
      and is_meaningful_trade_link_requirement(slot_name, requirement.value)
    then
      return safe_number(requirement.value)
    end
  end

  return nil
end

local function get_budget_limit_chaos(payload)
  local analysis_mode = normalize_key(as_table(payload.run).analysis_mode)
  if analysis_mode ~= "thorough" then
    return nil
  end

  return safe_number(as_table(payload.run).budget_chaos) or 0
end

local function slot_override_has_manual_tunings(slot_override)
  if type(slot_override) ~= "table" then
    return false
  end

  local disabled = slot_override.disabled_target_keys
  if type(disabled) == "table" and next(disabled) ~= nil then
    return true
  end

  local target_overrides = slot_override.target_overrides
  if type(target_overrides) == "table" and next(target_overrides) ~= nil then
    return true
  end

  local line_overrides = slot_override.line_overrides
  if type(line_overrides) == "table" and next(line_overrides) ~= nil then
    return true
  end

  return false
end

local function build_manual_tuning_slot_set(payload)
  local set = {}
  local search_constraints = as_table(as_table(payload.run).search_constraints)
  local slot_overrides = as_table(search_constraints.slot_overrides)
  for slot_key, slot_override in pairs(slot_overrides) do
    if slot_override_has_manual_tunings(slot_override) then
      local normalized = normalize_slot_match_key(slot_key)
      if normalized then
        set[normalized] = true
      end
    end
  end
  return set
end

local function build_incremental_rerun_slot_set(payload)
  local set = {}
  local slots = as_table(as_table(payload.run).rerun_changed_slots)
  for _, slot_name in ipairs(slots) do
    local normalized = normalize_slot_match_key(slot_name)
    if normalized then
      set[normalized] = true
    end
  end
  return set
end

local function is_within_budget_limit(price_chaos, budget_limit_chaos)
  local normalized_price = safe_number(price_chaos)
  if not normalized_price then
    return false
  end

  if budget_limit_chaos == nil then
    return true
  end

  return normalized_price <= budget_limit_chaos
end

local function build_pob_weighted_trade_query_url(league, slot_name, primary_metric, budget_chaos, hard_requirements)
  local normalized_league = trim(league)
  local normalized_slot_name = trim(slot_name)
  if not normalized_league or not normalized_slot_name then
    return nil
  end

  local cache_key = table.concat({
    normalized_league,
    normalized_slot_name,
    normalize_metric_key(primary_metric) or "totaldps",
    tostring(math.floor(safe_number(budget_chaos) or 0)),
  }, "::")

  if trade_query_url_cache[cache_key] ~= nil then
    return trade_query_url_cache[cache_key]
  end

  local slot = build
    and build.itemsTab
    and build.itemsTab.slots
    and (build.itemsTab.slots[normalized_slot_name] or build.itemsTab.slots[normalized_slot_name:gsub("%s+", " ")])
    or nil
  if not slot then
    trade_query_url_cache[cache_key] = nil
    return nil
  end

  local query_tab = build.itemsTab.tradeQuery
  if not query_tab then
    trade_query_url_cache[cache_key] = nil
    return nil
  end

  local generator = new("TradeQueryGenerator"):TradeQueryGenerator(query_tab)
  local query_json = nil
  local err_msg = nil
  generator.requesterContext = {}
  generator.requesterCallback = function(_, query, callback_err)
    query_json = query
    err_msg = callback_err
  end

  local options = {
    includeMirrored = false,
    includeCorrupted = false,
    includeScourge = false,
    includeEldritch = false,
    includeSynthesis = false,
    includeTalisman = false,
    influence1 = 1,
    influence2 = 1,
    statWeights = get_trade_stat_weights(primary_metric),
  }

  local normalized_budget = safe_number(budget_chaos)
  if normalized_budget and normalized_budget > 0 then
    options.maxPrice = math.floor(normalized_budget)
    options.maxPriceType = "chaos"
  end

  local min_links = get_min_links_for_slot(hard_requirements, normalized_slot_name)
  if min_links and min_links > 0 then
    options.links = math.floor(min_links)
  end

  generator:StartQuery(slot, options)
  while generator.calcContext and generator.calcContext.co ~= nil do
    generator:OnFrame()
  end

  if not query_json or err_msg then
    if err_msg then
      add_warning("PoB trade query for " .. normalized_slot_name .. " could not be generated: " .. err_msg)
    end
    trade_query_url_cache[cache_key] = nil
    return nil
  end

  local base_url = query_tab.tradeQueryRequests:buildUrl(query_tab.hostName .. "trade/search", "pc", normalized_league)
  local result = base_url .. "?q=" .. urlEncode(query_json)
  trade_query_url_cache[cache_key] = result
  return result
end

local function evaluate_with_item_tab_undo(fn)
  local items_tab = build and build.itemsTab or nil
  if not items_tab or not items_tab.CreateUndoState or not items_tab.RestoreUndoState then
    return nil, "Item-tab undo support is unavailable in the PoB runtime."
  end

  local undo_state = items_tab:CreateUndoState()
  local ok, result, err = xpcall(fn, function(runtime_err)
    return debug.traceback(runtime_err, 2)
  end)

  items_tab:RestoreUndoState(undo_state)
  build.modFlag = true
  build.buildFlag = true
  force_gc()

  if not ok then
    return nil, result
  end

  return result, err
end

local function evaluate_unique_swap(build_target, target_stage, character_snapshot, slot_name, unique_name, base_type)
  stderr_print(string.format("[exact][unique] evaluating slot=%s item=%s", tostring(slot_name), tostring(unique_name)))
  local template = find_unique_template(unique_name, base_type)
  if not template then
    return nil, "Unique was not found in PoB's unique database."
  end

  return evaluate_with_item_tab_undo(function()
    local slot_control = build.itemsTab and build.itemsTab.slots and build.itemsTab.slots[slot_name] or nil
    if not slot_control then
      return nil, "Target slot could not be resolved inside the active item set."
    end

    local item = new("Item"):Item(template.raw, "UNIQUE", true)
    item:BuildAndParseRaw()
    build.itemsTab:AddItem(item, true)

    if not build.itemsTab:IsItemValidForSlot(item, slot_name) then
      return nil, "Unique could not be equipped in the mapped target slot."
    end

    slot_control:SetSelItemId(item.id)
    build.itemsTab:PopulateSlots()
    ensure_main_skill_max_stages()
    rebuild_current_build()

    return {
      metrics = collect_metrics(),
    }, nil
  end)
end

local function get_rare_slot_context(slot_name)
  local rare_slot_context = as_table(payload and payload.rare_slot_context)
  local direct = as_table(slot_name and rare_slot_context[slot_name] or nil)
  if next(direct) ~= nil then
    return direct
  end

  local wanted_slot = normalize_slot_match_key(slot_name)
  if not wanted_slot then
    return {}
  end

  for context_slot, context_value in pairs(rare_slot_context) do
    if normalize_slot_match_key(context_slot) == wanted_slot then
      return as_table(context_value)
    end
  end

  return {}
end

local function extract_item_sections(raw_text)
  local sections = {}
  local current = {}

  if type(raw_text) ~= "string" then
    return sections
  end

  for raw_line in raw_text:gmatch("[^\r\n]+") do
    local line = trim(raw_line)
    if line then
      if line == "--------" then
        if #current > 0 then
          table.insert(sections, current)
          current = {}
        end
      else
        table.insert(current, line)
      end
    end
  end

  if #current > 0 then
    table.insert(sections, current)
  end

  return sections
end

local function extract_relevant_item_lines(raw_text)
  local sections = extract_item_sections(raw_text)
  local selected_sections = {}

  if #sections > 1 then
    for index = 2, #sections do
      table.insert(selected_sections, sections[index])
    end
  else
    selected_sections = sections
  end

  local lines = {}
  for _, section in ipairs(selected_sections) do
    for _, line in ipairs(as_table(section)) do
      local normalized = trim(line)
      if normalized and normalized ~= "--------" then
        table.insert(lines, normalized)
      end
    end
  end

  return lines
end

local function normalize_string_list(value)
  local result = {}
  for _, entry in ipairs(as_table(value)) do
    local normalized = trim(entry)
    if normalized then
      table.insert(result, normalized)
    end
  end
  return result
end

local function includes_token(line, tokens)
  local normalized_line = normalize_key(line)
  if not normalized_line then
    return false
  end

  for _, token in ipairs(normalize_string_list(tokens)) do
    local normalized_token = normalize_key(token)
    if normalized_token and normalized_line:find(normalized_token, 1, true) then
      return true
    end
  end

  return false
end

local function line_starts_with_token(line, tokens, prefix)
  local normalized_line = normalize_key(line)
  local normalized_prefix = normalize_key(prefix) or ""
  if not normalized_line then
    return false
  end

  for _, token in ipairs(normalize_string_list(tokens)) do
    local normalized_token = normalize_key(token)
    local expected_prefix = normalized_prefix .. normalized_token
    if normalized_token and normalized_line:sub(1, #expected_prefix) == expected_prefix then
      return true
    end
  end

  return false
end

local function is_likely_dependency_source_line(line, source_tokens)
  local normalized_line = normalize_key(line)
  if not normalized_line or not includes_token(line, source_tokens) then
    return false
  end

  return normalized_line:match("grants level %d+ .+ skill")
    or normalized_line:match("triggers? level %d+ ")
    or line_starts_with_token(line, source_tokens, "you have ")
    or line_starts_with_token(line, source_tokens, "gain ")
    or line_starts_with_token(line, source_tokens, "affects you with ")
    or line_starts_with_token(line, source_tokens, "affected by ")
    or normalized_line:match("^summon")
    or normalized_line:match("^summons")
    or normalized_line:match(" on hit")
end

local function find_dependency_source_line(raw_text, source_tokens)
  for _, line in ipairs(extract_relevant_item_lines(raw_text)) do
    if is_likely_dependency_source_line(line, source_tokens) then
      return line
    end
  end

  return nil
end

local normalize_modifier_line_text

local function extract_allocation_lines(raw_text)
  local lines = {}

  if type(raw_text) ~= "string" then
    return lines
  end

  for raw_line in raw_text:gmatch("[^\r\n]+") do
    local normalized_line = normalize_modifier_line_text(raw_line)
    if normalized_line and normalized_line:match("^Allocates ") then
      table.insert(lines, normalized_line)
    end
  end

  return lines
end

local function candidate_is_anointable(raw_text)
  for _, line in ipairs(extract_relevant_item_lines(raw_text)) do
    if normalize_key(line) == "can be anointed" then
      return true
    end
  end

  return false
end

local function apply_transferable_anoint_to_raw_text(raw_text, slot_context)
  local normalized_text = trim(raw_text)
  local transferable_anoint = as_table(slot_context and slot_context.transferable_anoint)
  local allocation_line = trim(transferable_anoint.allocation_line)
  local passive_name = trim(transferable_anoint.passive_name)

  if not normalized_text or not allocation_line or not candidate_is_anointable(normalized_text) then
    return normalized_text, nil
  end

  local has_matching_allocation = false
  local has_other_allocation = false
  for _, existing_line in ipairs(extract_allocation_lines(normalized_text)) do
    if normalize_key(existing_line) == normalize_key(allocation_line) then
      has_matching_allocation = true
    else
      has_other_allocation = true
    end
  end

  if has_matching_allocation and not has_other_allocation then
    return normalized_text, nil
  end

  local lines = {}
  for raw_line in normalized_text:gmatch("[^\r\n]+") do
    local normalized_line = normalize_modifier_line_text(raw_line)
    if not (normalized_line and normalized_line:match("^Allocates ")) then
      table.insert(lines, raw_line)
    end
  end

  table.insert(lines, allocation_line)
  local next_text = trim(table.concat(lines, "\n")) or normalized_text

  return next_text, {
    kind = "transferable_anoint",
    label = passive_name or trim(allocation_line:gsub("^Allocates%s+", "")),
    passive_name = passive_name,
    allocation_line = allocation_line,
    source = "target_stage_anoint",
  }
end

local function get_strict_required_effects(slot_context)
  local effects = {}

  for _, effect in ipairs(as_table(slot_context and slot_context.strict_required_effects)) do
    if type(effect) == "table" then
      table.insert(effects, effect)
    end
  end

  return effects
end

local function candidate_preserves_required_source_effects(raw_text, required_source_effects)
  local preserved_effects = {}

  for _, effect in ipairs(as_table(required_source_effects)) do
    local source_aliases = normalize_string_list(effect.source_aliases)
    if #source_aliases == 0 then
      table.insert(preserved_effects, effect)
    else
      local source_line = find_dependency_source_line(raw_text, source_aliases)
      if not source_line then
        return false, effect, preserved_effects
      end

      table.insert(preserved_effects, {
        key = trim(effect.key),
        label = trim(effect.label),
        aliases = normalize_string_list(effect.aliases),
        source_aliases = source_aliases,
        source_reason = trim(effect.source_reason) or trim(source_line),
        matched_source_line = trim(source_line),
      })
    end
  end

  return true, nil, preserved_effects
end

local function build_reservation_evaluation(before_delta, after_delta)
  local normalized_before = safe_number(before_delta)
  local normalized_after = safe_number(after_delta)
  local delta_gain = nil

  if normalized_before ~= nil and normalized_after ~= nil then
    delta_gain = normalized_after - normalized_before
  end

  local before_blocked = normalized_before ~= nil and normalized_before < 0
  local after_blocked = normalized_after ~= nil and normalized_after < 0
  local resolves_blocker = before_blocked and normalized_after ~= nil and normalized_after >= 0
  local creates_blocker = normalized_before ~= nil and normalized_before >= 0 and after_blocked
  local worsens_blocker = before_blocked and normalized_after ~= nil and normalized_after < normalized_before
  local reservation_progress_score = 0

  if before_blocked and delta_gain and delta_gain > 0 then
    reservation_progress_score = math.min(30, delta_gain / 3)
  end

  local reservation_status = "unknown"
  if normalized_before ~= nil and normalized_after ~= nil then
    if resolves_blocker then
      reservation_status = "resolved_blocker"
    elseif creates_blocker then
      reservation_status = "created_blocker"
    elseif before_blocked and after_blocked and delta_gain and delta_gain > 0 then
      reservation_status = "improved_blocked"
    elseif after_blocked then
      reservation_status = "blocked"
    else
      reservation_status = "fit"
    end
  end

  return {
    reservation_before_delta = normalized_before,
    reservation_after_delta = normalized_after,
    reservation_delta_gain = delta_gain,
    reservation_status = reservation_status,
    reservation_progress_score = reservation_progress_score,
    resolves_reservation_blocker = resolves_blocker,
    creates_reservation_blocker = creates_blocker,
    worsens_reservation_blocker = worsens_blocker,
  }
end

local function evaluate_rare_swap(build_target, target_stage, character_snapshot, slot_name, raw_text, options)
  local normalized_text = trim(raw_text)
  if not normalized_text then
    return nil, "Rare candidate was missing raw item text."
  end
  stderr_print(string.format("[exact][rare] evaluating slot=%s", tostring(slot_name)))

  local slot_context = as_table((options and options.slot_context) or get_rare_slot_context(slot_name))
  local required_source_effects = get_strict_required_effects(slot_context)
  local scored_raw_text, applied_transferable_anoint = apply_transferable_anoint_to_raw_text(
    normalized_text,
    slot_context
  )
  local preserves_required_effects, missing_required_effect, preserved_source_effects =
    candidate_preserves_required_source_effects(scored_raw_text, required_source_effects)

  if not preserves_required_effects then
    return {
      rejected = true,
      rejected_reason = "missing_required_source_effect",
      rejected_detail = trim(missing_required_effect and missing_required_effect.label)
        or trim(missing_required_effect and missing_required_effect.key)
        or "required source effect",
      required_source_effects = required_source_effects,
    }, nil
  end

  return evaluate_with_item_tab_undo(function()
    local slot_control = build.itemsTab and build.itemsTab.slots and build.itemsTab.slots[slot_name] or nil
    if not slot_control then
      return nil, "Target slot could not be resolved inside the active item set."
    end

    local item = new("Item"):Item(scored_raw_text, "RARE", true)
    item:BuildAndParseRaw()
    build.itemsTab:AddItem(item, true)

    if not build.itemsTab:IsItemValidForSlot(item, slot_name) then
      return nil, "Rare item could not be equipped in the mapped target slot."
    end

    slot_control:SetSelItemId(item.id)
    build.itemsTab:PopulateSlots()
    ensure_main_skill_max_stages()
    rebuild_current_build()

    local env, output = get_current_calcs_state()
    local reservation_after_delta = calculate_reserved_mana_delta(env, output)
    local reservation_evaluation = build_reservation_evaluation(
      options and options.reservation_before_delta,
      reservation_after_delta
    )

    local applied_slot_effects = {}
    if applied_transferable_anoint then
      table.insert(applied_slot_effects, applied_transferable_anoint)
    end

    return {
      metrics = collect_metrics(),
      simulated_raw_text = scored_raw_text,
      applied_slot_effects = applied_slot_effects,
      required_source_effects = preserved_source_effects,
      reservation_before_delta = reservation_evaluation.reservation_before_delta,
      reservation_after_delta = reservation_evaluation.reservation_after_delta,
      reservation_delta_gain = reservation_evaluation.reservation_delta_gain,
      reservation_status = reservation_evaluation.reservation_status,
      reservation_progress_score = reservation_evaluation.reservation_progress_score,
      resolves_reservation_blocker = reservation_evaluation.resolves_reservation_blocker,
      creates_reservation_blocker = reservation_evaluation.creates_reservation_blocker,
      worsens_reservation_blocker = reservation_evaluation.worsens_reservation_blocker,
    }, nil
  end)
end

local function metric_delta(before_metrics, after_metrics, metric_key)
  local before_value = safe_number(before_metrics and before_metrics[metric_key]) or 0
  local after_value = safe_number(after_metrics and after_metrics[metric_key]) or 0
  return after_value - before_value
end

local function capped_resistance_gain(before_metrics, after_metrics, metric_key)
  local before_value = safe_number(before_metrics and before_metrics[metric_key]) or 0
  local after_value = safe_number(after_metrics and after_metrics[metric_key]) or 0
  return math.max(0, math.min(after_value, 75) - math.min(before_value, 75))
end

local function crosses_below_cap(before_metrics, after_metrics, metric_key, cap)
  local before_value = safe_number(before_metrics and before_metrics[metric_key]) or 0
  local after_value = safe_number(after_metrics and after_metrics[metric_key]) or 0
  return before_value >= cap and after_value < cap
end

local elemental_resistance_fields = {
  { key = "fire", metric_key = "fireResist", label = "fire" },
  { key = "cold", metric_key = "coldResist", label = "cold" },
  { key = "lightning", metric_key = "lightningResist", label = "lightning" },
}

normalize_modifier_line_text = function(line)
  local normalized = trim(line)
  if not normalized then
    return nil
  end

  normalized = normalized:gsub("%b{}", " ")
  normalized = normalized:gsub("%s+", " ")
  normalized = normalized:gsub("^%s+", ""):gsub("%s+$", "")

  while true do
    local stripped = normalized:gsub("%s+%b()%s*$", "")
    if stripped == normalized then
      break
    end
    normalized = stripped:gsub("%s+$", "")
  end

  return trim(normalized)
end

local function extract_single_elemental_resistance_totals(raw_text)
  if type(raw_text) ~= "string" then
    return nil
  end

  local totals = {
    fire = 0,
    cold = 0,
    lightning = 0,
  }
  local found = false

  for line in raw_text:gmatch("[^\r\n]+") do
    local normalized_line = normalize_modifier_line_text(line)
    if normalized_line then
      local fire_value = safe_number(normalized_line:match("^%+([%d%.]+)%% to Fire Resistance$"))
      if fire_value then
        totals.fire = totals.fire + fire_value
        found = true
      end

      local cold_value = safe_number(normalized_line:match("^%+([%d%.]+)%% to Cold Resistance$"))
      if cold_value then
        totals.cold = totals.cold + cold_value
        found = true
      end

      local lightning_value = safe_number(normalized_line:match("^%+([%d%.]+)%% to Lightning Resistance$"))
      if lightning_value then
        totals.lightning = totals.lightning + lightning_value
        found = true
      end
    end
  end

  totals.total = totals.fire + totals.cold + totals.lightning
  if not found or totals.total <= 0 then
    return nil
  end

  return totals
end

local function build_resistance_transfer_actions(current_totals, desired_totals)
  local sources = {}
  local targets = {}

  for _, field in ipairs(elemental_resistance_fields) do
    local current_value = safe_number(current_totals and current_totals[field.key]) or 0
    local desired_value = safe_number(desired_totals and desired_totals[field.key]) or 0
    local delta = current_value - desired_value
    if delta > 0.001 then
      table.insert(sources, {
        key = field.key,
        label = field.label,
        amount = delta,
      })
    elseif delta < -0.001 then
      table.insert(targets, {
        key = field.key,
        label = field.label,
        amount = -delta,
      })
    end
  end

  local actions = {}
  local target_index = 1

  for _, source in ipairs(sources) do
    local remaining = source.amount
    while remaining > 0.001 and target_index <= #targets do
      local target = targets[target_index]
      local amount = math.min(remaining, target.amount)
      if amount > 0.001 then
        local rounded_amount = math.max(1, math.floor(amount + 0.5))
        table.insert(actions, {
          from = source.key,
          to = target.key,
          amount = rounded_amount,
          label = string.format(
            "Convert %d%% %s resistance to %s resistance to stay capped.",
            rounded_amount,
            source.label,
            target.label
          ),
        })
      end
      remaining = remaining - amount
      target.amount = target.amount - amount
      if target.amount <= 0.001 then
        target_index = target_index + 1
      end
    end
  end

  return actions
end

local function evaluate_flexible_elemental_resistance(after_metrics, raw_text, cap)
  local current_totals = extract_single_elemental_resistance_totals(raw_text)
  if not current_totals then
    return nil
  end

  local resistance_cap = safe_number(cap) or 75
  local fixed_values = {}
  local required_allocation = {}
  local current_deficits = {}
  local total_required = 0
  local current_deficit_total = 0

  for _, field in ipairs(elemental_resistance_fields) do
    local after_value = safe_number(after_metrics and after_metrics[field.metric_key]) or 0
    local current_value = safe_number(current_totals[field.key]) or 0
    local fixed_value = after_value - current_value
    local required_value = math.max(0, resistance_cap - fixed_value)
    local current_deficit_value = math.max(0, resistance_cap - after_value)

    fixed_values[field.key] = fixed_value
    required_allocation[field.key] = required_value
    current_deficits[field.key] = current_deficit_value
    total_required = total_required + required_value
    current_deficit_total = current_deficit_total + current_deficit_value
  end

  local feasible = total_required <= (safe_number(current_totals.total) or 0) + 0.001
  local context = {
    feasible = feasible,
    total_pool = current_totals.total,
    current_totals = current_totals,
    fixed_values = fixed_values,
    required_allocation = required_allocation,
    current_deficits = current_deficits,
    current_deficit_total = current_deficit_total,
  }

  if feasible and current_deficit_total > 0 then
    local desired_allocation = {
      fire = safe_number(required_allocation.fire) or 0,
      cold = safe_number(required_allocation.cold) or 0,
      lightning = safe_number(required_allocation.lightning) or 0,
    }
    local remaining_pool = (safe_number(current_totals.total) or 0) - total_required

    for _, field in ipairs(elemental_resistance_fields) do
      if remaining_pool <= 0.001 then
        break
      end
      local key = field.key
      local keepable_value = math.max(
        0,
        (safe_number(current_totals[key]) or 0) - (safe_number(desired_allocation[key]) or 0)
      )
      if keepable_value > 0 then
        local extra_value = math.min(remaining_pool, keepable_value)
        desired_allocation[key] = (safe_number(desired_allocation[key]) or 0) + extra_value
        remaining_pool = remaining_pool - extra_value
      end
    end

    if remaining_pool > 0.001 then
      desired_allocation.fire = (safe_number(desired_allocation.fire) or 0) + remaining_pool
    end

    context.desired_allocation = desired_allocation
    context.suggested_actions = build_resistance_transfer_actions(current_totals, desired_allocation)
  end

  return context
end

local function serialize_flexible_elemental_resistance(context)
  if type(context) ~= "table" or context.feasible ~= true then
    return nil
  end

  local current_deficit_total = safe_number(context.current_deficit_total) or 0
  local actions = as_table(context.suggested_actions)
  if current_deficit_total <= 0 or #actions == 0 then
    return nil
  end

  return {
    total_pool = safe_number(context.total_pool) or 0,
    current_totals = {
      fire = safe_number(as_table(context.current_totals).fire) or 0,
      cold = safe_number(as_table(context.current_totals).cold) or 0,
      lightning = safe_number(as_table(context.current_totals).lightning) or 0,
    },
    current_deficits = {
      fire = safe_number(as_table(context.current_deficits).fire) or 0,
      cold = safe_number(as_table(context.current_deficits).cold) or 0,
      lightning = safe_number(as_table(context.current_deficits).lightning) or 0,
    },
    suggested_actions = actions,
  }
end

local function sum_exact_elemental_resistance_gains(fire_cap_gain, cold_cap_gain, lightning_cap_gain)
  return (safe_number(fire_cap_gain) or 0)
    + (safe_number(cold_cap_gain) or 0)
    + (safe_number(lightning_cap_gain) or 0)
end

local function create_exact_score_breakdown(args)
  local primary_metric = normalize_metric_key(args and args.primary_metric)
  local price = math.max(safe_number(args and args.price_chaos) or 0, 1)
  local primary_delta = safe_number(args and args.primary_delta) or 0
  local ehp_delta = safe_number(args and args.ehp_delta) or 0
  local life_delta = safe_number(args and args.life_delta) or 0
  local capped_resistance_gain = safe_number(args and args.capped_resistance_gain) or 0
  local chaos_resist_delta = safe_number(args and args.chaos_resist_delta) or 0
  local reservation_before_delta = safe_number(args and args.reservation_before_delta)
  local reservation_after_delta = safe_number(args and args.reservation_after_delta)
  local reservation_delta_gain = safe_number(args and args.reservation_delta_gain) or 0
  local resolves_reservation_blocker = args and args.resolves_reservation_blocker == true
  local dps_score = primary_delta / price
  local ehp_score = ((ehp_delta / 25) + (life_delta / 5) + capped_resistance_gain
    + (math.max(chaos_resist_delta, 0) / 2)) / price
  local reservation_score = 0

  if reservation_before_delta and reservation_after_delta and reservation_before_delta < 0 and reservation_delta_gain > 0 then
    reservation_score = reservation_delta_gain * 120
    if resolves_reservation_blocker then
      reservation_score = reservation_score + 25000
    end
  end

  return {
    version = 2,
    primary_metric = primary_metric,
    dps_score = dps_score,
    ehp_score = ehp_score,
    reservation_score = reservation_score,
  }, dps_score, ehp_score, reservation_score
end

local function create_exact_unique_plan(args)
  local primary_metric = normalize_metric_key(args.primary_metric)
  local primary_delta = metric_delta(args.before_metrics, args.after_metrics, primary_metric)
  local ehp_delta = metric_delta(args.before_metrics, args.after_metrics, "totalEhp")
  local life_delta = metric_delta(args.before_metrics, args.after_metrics, "life")
  local fire_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "fireResist")
  local cold_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "coldResist")
  local lightning_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "lightningResist")
  local capped_resistance_gain_total = sum_exact_elemental_resistance_gains(
    fire_cap_gain,
    cold_cap_gain,
    lightning_cap_gain
  )
  local chaos_delta = metric_delta(args.before_metrics, args.after_metrics, "chaosResist")
  local price = math.max(args.price_chaos or 0, 1)
  local mandatory = args.mandatory_unique == true
  local stage_progress_score = mandatory and 1.5 or 1.0
  local score_breakdown, dps_score, ehp_score, reservation_score = create_exact_score_breakdown({
    primary_metric = primary_metric,
    primary_delta = primary_delta,
    ehp_delta = ehp_delta,
    life_delta = life_delta,
    capped_resistance_gain = capped_resistance_gain_total,
    chaos_resist_delta = chaos_delta,
    price_chaos = price,
  })
  local score = (mandatory and 1000 or 350) + dps_score + ehp_score + reservation_score

  return {
    category = args.category or (mandatory and "unlock_next_stage" or "best_single"),
    kind = "single",
    title = (mandatory and "Buy staged unique: " or "Exact unique upgrade: ") .. args.unique_name,
    summary = mandatory
      and ("The selected PoB stage expects " .. args.unique_name .. " in " .. args.slot_name .. ".")
      or ("Exact PoB swap scoring for " .. args.unique_name .. " in " .. args.slot_name .. "."),
    explanation = "This recommendation was scored by Path of Building using the selected stage loadout and your current character overlay.",
    effective_cost_chaos = args.price_chaos,
    ask_price_chaos = args.price_chaos,
    score = score,
    stage_progress_score = stage_progress_score,
    ranking_reason = {
      exact_eval = true,
      candidate_type = "market_unique",
      primary_metric = primary_metric,
      primary_delta = primary_delta,
      total_ehp_delta = ehp_delta,
      life_delta = life_delta,
      capped_resistance_gain = capped_resistance_gain_total,
      chaos_resist_delta = chaos_delta,
      mandatory_unique = mandatory,
      target_stage_slot = args.slot_name,
      score_breakdown = score_breakdown,
    },
    before_metrics = args.before_metrics,
    after_metrics = args.after_metrics,
    breaks_requirements = false,
    items = {
      {
        source = "market",
        slot = args.slot_name,
        item_name = args.unique_name,
        item_payload = {
          base_type = args.base_type,
          exact_eval = true,
          target_stage_slot = args.slot_name,
          candidate_type = "market_unique",
          rarity = "Unique",
          raw_text = args.raw_text,
          icon_url = args.icon_url,
          variant = args.variant,
          links = args.links,
          price_source = args.price_source or "poe_ninja",
          trade_link_kind = "name_search",
        },
        trade_link = build_trade_link(args.league, args.unique_name),
        ask_price_chaos = args.price_chaos,
        effective_price_chaos = args.price_chaos,
      },
    },
  }
end

local function estimate_stage_rare_price_chaos(stage_item)
  local slot_key = normalize_slot_match_key(stage_item and stage_item.slot)
  local raw_text = tostring(stage_item and stage_item.raw_text or "")
  local base_costs = {
    ["weapon 1"] = 95,
    ["weapon 2"] = 60,
    ["body armour"] = 75,
    helmet = 35,
    gloves = 32,
    boots = 36,
    ["ring 1"] = 28,
    ["ring 2"] = 28,
    amulet = 40,
    belt = 30,
  }

  local estimated = base_costs[slot_key] or 30

  if raw_text:find("to maximum Life", 1, true) then
    estimated = estimated + 10
  end
  if raw_text:find("to all Elemental Resistances", 1, true) then
    estimated = estimated + 12
  end
  if raw_text:find("to Chaos Resistance", 1, true) then
    estimated = estimated + 10
  end
  if raw_text:find("Attack Speed", 1, true) or raw_text:find("Cast Speed", 1, true) then
    estimated = estimated + 10
  end
  if raw_text:find("Critical Strike", 1, true) then
    estimated = estimated + 10
  end
  if raw_text:find("Suppress Spell Damage", 1, true) then
    estimated = estimated + 10
  end
  if raw_text:find("Adds ", 1, true) then
    estimated = estimated + 8
  end
  if raw_text:find("+# to Level of", 1, false) or raw_text:find("%+1 to Level of") then
    estimated = estimated + 20
  end

  if is_meaningful_trade_link_requirement(
    stage_item and stage_item.slot,
    stage_item and stage_item.max_link_count
  ) then
    estimated = estimated + 90
  end

  return math.max(1, estimated)
end

local function get_reservation_rejection_reason(reservation_context)
  local context = as_table(reservation_context)
  if context.creates_reservation_blocker == true then
    return "mana reservation blocker"
  end
  if context.worsens_reservation_blocker == true then
    return "worsened mana reservation blocker"
  end
  return nil
end

local function has_meaningful_rare_gain(before_metrics, after_metrics, primary_metric, reservation_context)
  local normalized_reservation = as_table(reservation_context)
  if normalized_reservation.resolves_reservation_blocker == true then
    return true
  end
  if (safe_number(normalized_reservation.reservation_progress_score) or 0) > 0 then
    return true
  end

  return metric_delta(before_metrics, after_metrics, primary_metric) > 0
    or metric_delta(before_metrics, after_metrics, "totalEhp") > 0
    or metric_delta(before_metrics, after_metrics, "life") > 0
    or capped_resistance_gain(before_metrics, after_metrics, "fireResist") > 0
    or capped_resistance_gain(before_metrics, after_metrics, "coldResist") > 0
    or capped_resistance_gain(before_metrics, after_metrics, "lightningResist") > 0
    or metric_delta(before_metrics, after_metrics, "chaosResist") > 0
end

local function log_exact_candidate_result(kind, label, before_metrics, after_metrics, primary_metric, extra)
  local details = {}
  if extra and type(extra) == "table" then
    for key, value in pairs(extra) do
      details[#details + 1] = tostring(key) .. "=" .. tostring(value)
    end
    table.sort(details)
  end

  stderr_print(string.format(
    "[exact][result] kind=%s label=%s primary_metric=%s primary_delta=%.3f ehp_delta=%.3f life_delta=%.3f fire_cap_gain=%.3f cold_cap_gain=%.3f lightning_cap_gain=%.3f chaos_delta=%.3f%s",
    tostring(kind),
    tostring(label),
    tostring(primary_metric),
    metric_delta(before_metrics, after_metrics, primary_metric),
    metric_delta(before_metrics, after_metrics, "totalEhp"),
    metric_delta(before_metrics, after_metrics, "life"),
    capped_resistance_gain(before_metrics, after_metrics, "fireResist"),
    capped_resistance_gain(before_metrics, after_metrics, "coldResist"),
    capped_resistance_gain(before_metrics, after_metrics, "lightningResist"),
    metric_delta(before_metrics, after_metrics, "chaosResist"),
    #details > 0 and (" " .. table.concat(details, " ")) or ""
  ))
end

local function log_exact_candidate_skip(kind, label, extra)
  local details = {}
  if extra and type(extra) == "table" then
    for key, value in pairs(extra) do
      details[#details + 1] = tostring(key) .. "=" .. tostring(value)
    end
    table.sort(details)
  end

  stderr_print(string.format(
    "[exact][skip] kind=%s label=%s%s",
    tostring(kind),
    tostring(label),
    #details > 0 and (" " .. table.concat(details, " ")) or ""
  ))
end

local function breaks_core_defence_requirements(before_metrics, after_metrics, options)
  local flexible_elemental_resistance = nil
  if type(options) == "table" and options.allow_flexible_elemental_resistance == true then
    flexible_elemental_resistance = evaluate_flexible_elemental_resistance(
      after_metrics,
      options.raw_text,
      options.resistance_cap or 75
    )
  end

  local can_preserve_elemental_caps = flexible_elemental_resistance and flexible_elemental_resistance.feasible == true

  if crosses_below_cap(before_metrics, after_metrics, "fireResist", 75) and not can_preserve_elemental_caps then
    return true, "fire resistance cap", flexible_elemental_resistance
  end
  if crosses_below_cap(before_metrics, after_metrics, "coldResist", 75) and not can_preserve_elemental_caps then
    return true, "cold resistance cap", flexible_elemental_resistance
  end
  if crosses_below_cap(before_metrics, after_metrics, "lightningResist", 75) and not can_preserve_elemental_caps then
    return true, "lightning resistance cap", flexible_elemental_resistance
  end

  local before_ehp = safe_number(before_metrics and before_metrics.totalEhp)
  local after_ehp = safe_number(after_metrics and after_metrics.totalEhp)
  if before_ehp and after_ehp and after_ehp < before_ehp * 0.9 then
    return true, "total EHP floor", flexible_elemental_resistance
  end

  return false, nil, flexible_elemental_resistance
end

local function to_reason_key(value)
  local normalized = normalize_key(value)
  if not normalized then
    return nil
  end

  normalized = normalized:gsub("[^a-z0-9]+", "_")
  normalized = normalized:gsub("^_+", ""):gsub("_+$", "")
  return trim(normalized)
end

local function has_hard_requirement_for_slot(hard_requirements, slot_name)
  local normalized_slot = normalize_slot_match_key(slot_name)
  if not normalized_slot then
    return false
  end

  for _, requirement in ipairs(as_table(hard_requirements)) do
    if normalize_slot_match_key(requirement and requirement.slot) == normalized_slot then
      return true
    end
  end

  return false
end

local function is_defensive_or_utility_outcome(score, ehp_score, reservation_progress_score, required_source_effects)
  local normalized_score = safe_number(score)
  if normalized_score == nil or normalized_score >= 0 then
    return false
  end

  if (safe_number(ehp_score) or 0) > 0 then
    return true
  end
  if (safe_number(reservation_progress_score) or 0) > 0 then
    return true
  end

  return #as_table(required_source_effects) > 0
end

local function build_exact_rare_evaluation_sentence(reason_key, reason, detail)
  local normalized_reason = to_reason_key(reason_key or reason)
  local detail_text = trim(detail)

  if normalized_reason == "same_as_equipped" then
    return "It already matches the currently equipped item in this slot."
  end
  if normalized_reason == "over_budget" then
    return "Its estimated price is above the current budget for this run."
  end
  if normalized_reason == "incremental_rerun_unchanged_slot" then
    return "This slot was carried forward from the base run because it was outside the incremental rerun scope."
  end
  if normalized_reason == "mana_reservation_blocker" then
    return "It would create a mana reservation blocker on the current setup."
  end
  if normalized_reason == "worsened_mana_reservation_blocker" then
    return "It would worsen the current mana reservation blocker."
  end
  if normalized_reason == "fire_resistance_cap" then
    return "It would break fire resistance cap as a one-slot swap."
  end
  if normalized_reason == "cold_resistance_cap" then
    return "It would break cold resistance cap as a one-slot swap."
  end
  if normalized_reason == "lightning_resistance_cap" then
    return "It would break lightning resistance cap as a one-slot swap."
  end
  if normalized_reason == "total_ehp_floor" then
    return "It drops total EHP too far as an isolated swap."
  end
  if normalized_reason == "missing_required_source_effect" then
    return "It would drop a build-critical source effect on this slot."
  end
  if normalized_reason == "not_meaningful" then
    return "As a one-slot swap, it does not improve the current setup enough to reach the main recommendation lane."
  end
  if normalized_reason == "exact_score_failed" then
    return "Path of Building could not exact-score this target item."
  end
  if normalized_reason == "score_negative" then
    return "Its blended overall score is negative in this isolated swap."
  end
  if reason then
    local sentence = "Decision note: " .. tostring(reason) .. "."
    if detail_text then
      sentence = sentence .. " Details: " .. detail_text .. "."
    end
    return sentence
  end

  return nil
end

local function create_exact_rare_plan(args)
  local primary_metric = normalize_metric_key(args.primary_metric)
  local primary_delta = metric_delta(args.before_metrics, args.after_metrics, primary_metric)
  local ehp_delta = metric_delta(args.before_metrics, args.after_metrics, "totalEhp")
  local life_delta = metric_delta(args.before_metrics, args.after_metrics, "life")
  local fire_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "fireResist")
  local cold_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "coldResist")
  local lightning_cap_gain = capped_resistance_gain(args.before_metrics, args.after_metrics, "lightningResist")
  local capped_resistance_gain_total = sum_exact_elemental_resistance_gains(
    fire_cap_gain,
    cold_cap_gain,
    lightning_cap_gain
  )
  local chaos_delta = metric_delta(args.before_metrics, args.after_metrics, "chaosResist")
  local price = math.max(args.price_chaos or 0, 1)
  local estimated_price = args.estimated_price ~= false
  local candidate_type = args.candidate_type or "target_stage_rare"
  local effective_trade_link_kind = args.trade_link_kind or (estimated_price and "pob_weighted_query" or "pob_weighted_query")
  local flexible_elemental_resistance = serialize_flexible_elemental_resistance(
    args.flexible_elemental_resistance
  )
  local reservation_before_delta = safe_number(args.reservation_before_delta)
  local reservation_after_delta = safe_number(args.reservation_after_delta)
  local reservation_delta_gain = safe_number(args.reservation_delta_gain)
  local reservation_progress_score = safe_number(args.reservation_progress_score) or 0
  local reservation_status = trim(args.reservation_status) or "unknown"
  local resolves_reservation_blocker = args.resolves_reservation_blocker == true
  local required_source_effects = as_table(args.required_source_effects)
  local applied_slot_effects = as_table(args.applied_slot_effects)
  local exact_eval = args.exact_eval ~= false
  local score_breakdown, dps_score, ehp_score, reservation_score = create_exact_score_breakdown({
    primary_metric = primary_metric,
    primary_delta = primary_delta,
    ehp_delta = ehp_delta,
    life_delta = life_delta,
    capped_resistance_gain = capped_resistance_gain_total,
    chaos_resist_delta = chaos_delta,
    price_chaos = price,
    reservation_before_delta = reservation_before_delta,
    reservation_after_delta = reservation_after_delta,
    reservation_delta_gain = reservation_delta_gain,
    resolves_reservation_blocker = resolves_reservation_blocker,
  })
  if type(args.score_breakdown_override) == "table" then
    score_breakdown = args.score_breakdown_override
    dps_score = safe_number(score_breakdown.dps_score) or dps_score
    ehp_score = safe_number(score_breakdown.ehp_score) or ehp_score
    reservation_score = safe_number(score_breakdown.reservation_score) or reservation_score
  end

  local score = safe_number(args.score_override)
  if score == nil then
    score = 220 + dps_score + ehp_score + reservation_score + (args.unlock_weight or 0)
  end

  local within_budget_limit = args.within_budget_limit ~= false
  local budget_limit_chaos = safe_number(args.budget_limit_chaos)
  local budget_delta_chaos = safe_number(args.budget_delta_chaos)
  if budget_limit_chaos ~= nil and args.price_chaos ~= nil then
    local numeric_price_chaos = safe_number(args.price_chaos)
    if numeric_price_chaos ~= nil then
      within_budget_limit = numeric_price_chaos <= budget_limit_chaos
      if within_budget_limit then
        budget_delta_chaos = 0
      elseif budget_delta_chaos == nil or budget_delta_chaos <= 0 then
        budget_delta_chaos = math.max(numeric_price_chaos - budget_limit_chaos, 0)
      end
    end
  elseif within_budget_limit and (budget_delta_chaos == nil or budget_delta_chaos <= 0) then
    budget_delta_chaos = 0
  end

  local evaluation_status = trim(args.evaluation_status) or "accepted"
  local evaluation_reason = trim(args.evaluation_reason)
  local evaluation_reason_key = trim(args.evaluation_reason_key) or to_reason_key(evaluation_reason)
  local evaluation_detail = trim(args.evaluation_detail)
  if within_budget_limit and evaluation_reason_key == "over_budget" then
    evaluation_reason = nil
    evaluation_reason_key = nil
    evaluation_detail = nil
    if evaluation_status == "budget_limited" or evaluation_status == "accepted_over_budget" then
      evaluation_status = "accepted"
    end
  end
  local evaluation_reason_sentence = build_exact_rare_evaluation_sentence(
    evaluation_reason_key,
    evaluation_reason,
    evaluation_detail
  )
  local target_stage_order_index = safe_number(args.target_stage_order_index)
  local overview_only = args.overview_only == true
  local exact_score_negative = score < 0
  local locally_positive = args.locally_positive == true
  local defensive_or_utility = args.defensive_or_utility == true
    or is_defensive_or_utility_outcome(
      score,
      ehp_score,
      reservation_progress_score,
      required_source_effects
    )
  local title = args.title_override
    or ((estimated_price and "Stage rare upgrade: " or "Market rare upgrade: ") .. (args.base_type or args.slot_name))
  local summary = args.summary_override
    or (
      estimated_price
        and ("Exact PoB swap scoring for the mapped rare " .. (args.base_type or "item") .. " in " .. args.slot_name .. ".")
        or ("Exact PoB swap scoring for a live market rare " .. (args.base_type or "item") .. " in " .. args.slot_name .. ".")
    )
  local explanation = args.explanation_override
    or (
      estimated_price
        and "This rare candidate comes directly from the selected PoB stage. Its impact is exact-scored in Path of Building, while the price is still an estimate until live rare trade search is wired in."
        or "This rare candidate came from a constrained live trade search inspired by the selected PoB stage and was then exact-scored in Path of Building."
    )

  return {
    category = args.category or "best_single",
    kind = "single",
    title = title,
    summary = summary,
    explanation = explanation,
    effective_cost_chaos = args.price_chaos,
    ask_price_chaos = args.price_chaos,
    score = score,
    stage_progress_score = args.stage_progress_score or 0.7,
    ranking_reason = {
      exact_eval = exact_eval,
      candidate_type = candidate_type,
      primary_metric = primary_metric,
      primary_delta = primary_delta,
      total_ehp_delta = ehp_delta,
      life_delta = life_delta,
      capped_resistance_gain = capped_resistance_gain_total,
      chaos_resist_delta = chaos_delta,
      target_stage_slot = args.slot_name,
      estimated_price = estimated_price,
      estimated_price_chaos = args.price_chaos,
      retained_for_incremental_rerun = args.retained_for_incremental_rerun == true,
      flexible_elemental_resistance_used = flexible_elemental_resistance ~= nil,
      required_source_effects = required_source_effects,
      applied_slot_effects = applied_slot_effects,
      reservation_before_delta = reservation_before_delta,
      reservation_after_delta = reservation_after_delta,
      reservation_delta_gain = reservation_delta_gain,
      reservation_status = reservation_status,
      reservation_progress_score = reservation_progress_score,
      resolves_reservation_blocker = resolves_reservation_blocker,
      evaluation_status = evaluation_status,
      evaluation_reason = evaluation_reason,
      evaluation_reason_key = evaluation_reason_key,
      evaluation_detail = evaluation_detail,
      evaluation_reason_sentence = evaluation_reason_sentence,
      exact_score_negative = exact_score_negative,
      defensive_or_utility = defensive_or_utility,
      locally_positive = locally_positive,
      within_budget_limit = within_budget_limit,
      budget_limit_chaos = budget_limit_chaos,
      budget_delta_chaos = budget_delta_chaos,
      overview_only = overview_only,
      target_stage_order_index = target_stage_order_index,
      score_breakdown = score_breakdown,
    },
    before_metrics = args.before_metrics,
    after_metrics = args.after_metrics,
    breaks_requirements = args.breaks_requirements == true,
    items = {
      {
        source = args.source or "market",
        slot = args.slot_name,
        item_name = args.item_name or (args.base_type and ("Rare " .. args.base_type) or ("Rare " .. args.slot_name)),
        item_payload = {
          base_type = args.base_type,
          stash_item_id = args.owned_item_id,
          owner_user_id = args.owner_user_id,
          exact_eval = exact_eval,
          target_stage_slot = args.slot_name,
          estimated_price = estimated_price,
          requires_search_iteration = estimated_price,
          candidate_type = candidate_type,
          rarity = "Rare",
          raw_text = args.raw_text,
          icon_url = args.icon_url,
          trade_link_kind = effective_trade_link_kind,
          trade_query_id = args.trade_query_id,
          trade_result_id = args.trade_result_id,
          price_source = args.price_source,
          listing_price_amount = args.listing_price_amount,
          listing_price_currency = args.listing_price_currency,
          retained_for_incremental_rerun = args.retained_for_incremental_rerun == true,
          flexible_elemental_resistance = flexible_elemental_resistance,
          required_source_effects = required_source_effects,
          applied_slot_effects = applied_slot_effects,
          reservation_before_delta = reservation_before_delta,
          reservation_after_delta = reservation_after_delta,
          reservation_delta_gain = reservation_delta_gain,
          reservation_status = reservation_status,
          reservation_progress_score = reservation_progress_score,
          resolves_reservation_blocker = resolves_reservation_blocker,
          evaluation_status = evaluation_status,
          evaluation_reason = evaluation_reason,
          evaluation_reason_key = evaluation_reason_key,
          evaluation_detail = evaluation_detail,
          evaluation_reason_sentence = evaluation_reason_sentence,
          exact_score_negative = exact_score_negative,
          defensive_or_utility = defensive_or_utility,
          locally_positive = locally_positive,
          within_budget_limit = within_budget_limit,
          budget_limit_chaos = budget_limit_chaos,
          budget_delta_chaos = budget_delta_chaos,
          overview_only = overview_only,
          target_stage_order_index = target_stage_order_index,
        },
        trade_link = args.trade_link,
        ask_price_chaos = args.price_chaos,
        effective_price_chaos = args.price_chaos,
      },
    },
  }
end

local function create_stage_rare_overview_plan(args)
  local base_type = trim(args.base_type) or trim(args.slot_name) or "item"
  local slot_name = trim(args.slot_name) or base_type
  local explanation_parts = {
    "This row exact-scores the selected PoB target item as a one-slot swap against your current character."
  }
  local evaluation_sentence = build_exact_rare_evaluation_sentence(
    args.evaluation_reason_key,
    args.evaluation_reason,
    args.evaluation_detail
  )

  if evaluation_sentence then
    table.insert(explanation_parts, evaluation_sentence)
  end
  if args.within_budget_limit == false then
    table.insert(explanation_parts, "Live rare search stayed off for this slot because the estimated price is above the current budget.")
  end
  if args.locally_positive == true then
    table.insert(explanation_parts, "It remains locally positive in the default blended ranking.")
  elseif args.defensive_or_utility == true then
    table.insert(explanation_parts, "A negative overall score here can still mean the item is mostly defensive or utility-focused, so check the DPS, EHP, and reservation notes before discarding it.")
  end

  return create_exact_rare_plan({
    base_type = args.base_type,
    item_name = args.item_name,
    slot_name = slot_name,
    price_chaos = args.price_chaos,
    before_metrics = args.before_metrics,
    after_metrics = args.after_metrics,
    primary_metric = args.primary_metric,
    stage_progress_score = args.stage_progress_score or 0.45,
    category = args.category or "best_single",
    raw_text = args.raw_text,
    trade_link = args.trade_link,
    trade_link_kind = args.trade_link_kind,
    retained_for_incremental_rerun = args.retained_for_incremental_rerun == true,
    flexible_elemental_resistance = args.flexible_elemental_resistance,
    required_source_effects = args.required_source_effects,
    applied_slot_effects = args.applied_slot_effects,
    reservation_before_delta = args.reservation_before_delta,
    reservation_after_delta = args.reservation_after_delta,
    reservation_delta_gain = args.reservation_delta_gain,
    reservation_status = args.reservation_status,
    reservation_progress_score = args.reservation_progress_score,
    resolves_reservation_blocker = args.resolves_reservation_blocker == true,
    title_override = args.title_override or ("Target PoB item score: " .. base_type),
    summary_override = args.summary_override
      or ("Exact target-stage score for the mapped rare " .. base_type .. " in " .. slot_name .. "."),
    explanation_override = args.explanation_override or table.concat(explanation_parts, " "),
    score_override = args.score_override,
    score_breakdown_override = args.score_breakdown_override,
    exact_eval = args.exact_eval ~= false,
    evaluation_status = args.evaluation_status,
    evaluation_reason = args.evaluation_reason,
    evaluation_reason_key = args.evaluation_reason_key,
    evaluation_detail = args.evaluation_detail,
    within_budget_limit = args.within_budget_limit,
    budget_limit_chaos = args.budget_limit_chaos,
    budget_delta_chaos = args.budget_delta_chaos,
    locally_positive = args.locally_positive == true,
    overview_only = true,
    breaks_requirements = args.breaks_requirements == true,
    defensive_or_utility = args.defensive_or_utility == true,
    estimated_price = true,
    target_stage_order_index = args.target_stage_order_index,
  })
end

local function get_plan_primary_slot(plan)
  if type(plan) ~= "table" then
    return nil
  end

  local items = as_table(plan.items)
  if #items > 0 then
    return trim(items[1] and items[1].slot)
  end

  local ranking_reason = as_table(plan.ranking_reason)
  return trim(ranking_reason.target_stage_slot)
end

local function get_plan_candidate_type(plan)
  if type(plan) ~= "table" then
    return nil
  end

  local ranking_reason = as_table(plan.ranking_reason)
  local candidate_type = trim(ranking_reason.candidate_type)
  if candidate_type then
    return candidate_type
  end

  local items = as_table(plan.items)
  if #items > 0 then
    return trim(as_table(items[1] and items[1].item_payload).candidate_type)
  end

  return nil
end

local function get_plan_category_priority(plan)
  local category = trim(plan and plan.category)
  if category == "unlock_next_stage" then
    return 3
  end
  if category == "owned_now" then
    return 2
  end
  if category == "best_single" then
    return 1
  end
  return 0
end

local function get_rare_plan_source_priority(plan)
  local candidate_type = get_plan_candidate_type(plan)
  if candidate_type == "owned_viscera" then
    return 3
  end
  if candidate_type == "market_rare" then
    return 2
  end
  if candidate_type == "target_stage_rare" then
    return 1
  end
  return 0
end

local function compare_ranked_plans(left, right)
  if get_plan_category_priority(left) ~= get_plan_category_priority(right) then
    return get_plan_category_priority(left) > get_plan_category_priority(right)
  end
  if get_rare_plan_source_priority(left) ~= get_rare_plan_source_priority(right) then
    return get_rare_plan_source_priority(left) > get_rare_plan_source_priority(right)
  end
  if safe_number(left and left.stage_progress_score) ~= safe_number(right and right.stage_progress_score) then
    return safe_number(left and left.stage_progress_score) > safe_number(right and right.stage_progress_score)
  end
  if safe_number(left and left.score) ~= safe_number(right and right.score) then
    return safe_number(left and left.score) > safe_number(right and right.score)
  end
  return safe_number(left and left.effective_cost_chaos) < safe_number(right and right.effective_cost_chaos)
end

local function select_best_rare_plan_per_slot(plans)
  local best_by_slot = {}
  local passthrough = {}

  for _, plan in ipairs(as_table(plans)) do
    local slot_name = get_plan_primary_slot(plan)
    if not slot_name then
      table.insert(passthrough, plan)
    else
      local normalized_slot = normalize_slot_match_key(slot_name) or slot_name
      local current = best_by_slot[normalized_slot]
      if not current or compare_ranked_plans(plan, current) then
        best_by_slot[normalized_slot] = plan
      end
    end
  end

  for _, plan in pairs(best_by_slot) do
    table.insert(passthrough, plan)
  end

  table.sort(passthrough, compare_ranked_plans)
  return passthrough
end

local function evaluate_exact_stage_unique_plans(payload, build_target, target_stage, character_snapshot, baseline_metrics)
  local item_set = as_table(target_stage.item_set)
  local stage_items = as_table(item_set.items)
  local budget_chaos = get_budget_limit_chaos(payload)
  local required_unique_lookup = build_required_unique_lookup(target_stage.hard_requirements)
  local primary_metric = normalize_metric_key(target_stage.primary_metric)
  local league = trim(character_snapshot.league)
  local plans = {}
  local evaluated_count = 0

  for _, stage_item in ipairs(stage_items) do
    if stage_item and normalize_key(stage_item.rarity) == "unique" and trim(stage_item.name) and trim(stage_item.slot) then
      local slot_name = trim(stage_item.slot)
      local unique_name = trim(stage_item.name)
      local name_key = normalize_key(unique_name)
      local market_entry = find_market_unique_candidate(
        payload.market_candidates,
        unique_name,
        slot_name,
        target_stage.hard_requirements
      )

      if market_entry and is_within_budget_limit(market_entry.chaos_value, budget_chaos) then
        if not is_unique_equipped_in_slot(character_snapshot, slot_name, unique_name) then
          local evaluation, evaluation_error = evaluate_unique_swap(
            build_target,
            target_stage,
            character_snapshot,
            slot_name,
            unique_name,
            trim(stage_item.type_line) or market_entry.base_type
          )

          if evaluation and evaluation.metrics then
            evaluated_count = evaluated_count + 1
            local breaks_requirements, broken_requirement = breaks_core_defence_requirements(
              baseline_metrics,
              evaluation.metrics
            )
            local mandatory_unique = required_unique_lookup[name_key] == true
            local meaningful_gain = has_meaningful_rare_gain(
              baseline_metrics,
              evaluation.metrics,
              primary_metric
            )

            if not breaks_requirements and meaningful_gain then
              log_exact_candidate_result("unique", unique_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "accepted",
                slot = slot_name,
                mandatory = mandatory_unique,
              })
              local plan = create_exact_unique_plan({
                unique_name = unique_name,
                base_type = trim(stage_item.type_line) or market_entry.base_type,
                slot_name = slot_name,
                price_chaos = market_entry.chaos_value,
                before_metrics = baseline_metrics,
                after_metrics = evaluation.metrics,
                primary_metric = primary_metric,
                mandatory_unique = mandatory_unique,
                league = league,
                raw_text = trim(stage_item.raw_text),
                icon_url = market_entry.icon,
                variant = market_entry.variant,
                links = market_entry.links,
                price_source = market_entry.price_source or "poe_ninja",
              })
              if (plan.score or 0) > 0 then
                table.insert(plans, plan)
              end
            elseif breaks_requirements and broken_requirement then
              log_exact_candidate_result("unique", unique_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = broken_requirement,
                slot = slot_name,
                mandatory = mandatory_unique,
              })
              add_warning(unique_name .. " was skipped because it would break " .. broken_requirement .. ".")
            elseif mandatory_unique then
              log_exact_candidate_result("unique", unique_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = "not-meaningful",
                slot = slot_name,
                mandatory = mandatory_unique,
              })
              add_warning(unique_name .. " matches the selected stage, but its isolated exact-scored swap was skipped because it is not a meaningful upgrade on the current setup.")
            else
              log_exact_candidate_result("unique", unique_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = "not-meaningful",
                slot = slot_name,
                mandatory = mandatory_unique,
              })
            end
          elseif evaluation_error then
            add_warning(unique_name .. " could not be exact-scored: " .. evaluation_error)
          end
        else
          log_exact_candidate_skip("unique", unique_name, {
            reason = "already-equipped-in-slot",
            slot = slot_name,
          })
        end
      elseif market_entry then
        log_exact_candidate_skip("unique", unique_name, {
          reason = "over-budget",
          slot = slot_name,
          price_chaos = market_entry.chaos_value,
          budget_chaos = budget_chaos,
        })
      else
        log_exact_candidate_skip("unique", unique_name, {
          reason = "missing-market-entry",
          slot = slot_name,
        })
      end
    end
  end

  table.sort(plans, function(left, right)
    if (left.stage_progress_score or 0) ~= (right.stage_progress_score or 0) then
      return (left.stage_progress_score or 0) > (right.stage_progress_score or 0)
    end
    return (left.score or 0) > (right.score or 0)
  end)

  return plans, evaluated_count
end

local function evaluate_exact_stage_rare_plans(payload, build_target, target_stage, character_snapshot, baseline_metrics, reservation_audit)
  local item_set = as_table(target_stage.item_set)
  local stage_items = as_table(item_set.items)
  local hard_requirements = as_table(target_stage.hard_requirements)
  local budget_chaos = get_budget_limit_chaos(payload)
  local primary_metric = normalize_metric_key(target_stage.primary_metric)
  local league = trim(character_snapshot.league)
  local reservation_before_delta = safe_number(as_table(reservation_audit).reserved_mana_delta)
  local incremental_rerun_slots = build_incremental_rerun_slot_set(payload)
  local incremental_rerun_active = next(incremental_rerun_slots) ~= nil
  local plans = {}
  local overview_plans = {}
  local evaluated_count = 0

  for stage_item_index, stage_item in ipairs(stage_items) do
    if stage_item
      and (normalize_key(stage_item.rarity) == "rare" or normalize_key(stage_item.slot) == "head" or normalize_key(stage_item.slot) == "body" or normalize_key(stage_item.slot) == "arm" or normalize_key(stage_item.slot) == "leg")
      and trim(stage_item.slot)
      and trim(stage_item.raw_text)
    then
      local slot_name = trim(stage_item.slot)
      local base_type = trim(stage_item.type_line)
      local estimated_price = estimate_stage_rare_price_chaos(stage_item)
      local within_budget_limit = is_within_budget_limit(estimated_price, budget_chaos)
      local budget_delta_chaos = (estimated_price and budget_chaos and estimated_price > budget_chaos)
        and (estimated_price - budget_chaos)
        or 0
      local slot_has_blocker = has_hard_requirement_for_slot(hard_requirements, slot_name)
      local overview_trade_link = build_pob_weighted_trade_query_url(
        league,
        slot_name,
        primary_metric,
        budget_chaos,
        hard_requirements
      )
      local slot_match_key = normalize_slot_match_key(slot_name)
      local slot_in_incremental_scope = (not incremental_rerun_active)
        or (slot_match_key and incremental_rerun_slots[slot_match_key] == true)
      local retain_non_positive = slot_match_key and incremental_rerun_slots[slot_match_key] == true
      if not slot_in_incremental_scope then
        log_exact_candidate_skip("stage-rare", trim(stage_item.type_line) or slot_name, {
          reason = "incremental-rerun-unchanged-slot",
          slot = slot_name,
        })
        table.insert(overview_plans, create_stage_rare_overview_plan({
          base_type = base_type,
          slot_name = slot_name,
          price_chaos = estimated_price,
          before_metrics = baseline_metrics,
          after_metrics = baseline_metrics,
          primary_metric = primary_metric,
          raw_text = trim(stage_item.raw_text),
          trade_link = overview_trade_link,
          trade_link_kind = "pob_weighted_query",
          score_override = 0,
          exact_eval = false,
          evaluation_status = "skipped",
          evaluation_reason = "incremental-rerun-unchanged-slot",
          evaluation_reason_key = "incremental_rerun_unchanged_slot",
          target_stage_order_index = stage_item_index,
          within_budget_limit = within_budget_limit,
          budget_limit_chaos = budget_chaos,
          budget_delta_chaos = budget_delta_chaos,
          locally_positive = false,
          retained_for_incremental_rerun = true,
        }))
      else
        local current_item = get_equipped_item_in_slot(character_snapshot, slot_name)
        if not is_same_item_text(current_item and current_item.pob_item_text, stage_item.raw_text) then
          local slot_context = get_rare_slot_context(slot_name)
          local evaluation, evaluation_error = evaluate_rare_swap(
            build_target,
            target_stage,
            character_snapshot,
            slot_name,
            stage_item.raw_text,
            {
              slot_context = slot_context,
              reservation_before_delta = reservation_before_delta,
            }
          )

          if evaluation and evaluation.rejected == true then
            local rejected_reason = evaluation.rejected_reason or "rejected"
            log_exact_candidate_skip("stage-rare", trim(stage_item.type_line) or slot_name, {
              reason = evaluation.rejected_reason or "rejected",
              slot = slot_name,
              detail = evaluation.rejected_detail,
            })
            table.insert(overview_plans, create_stage_rare_overview_plan({
              base_type = base_type,
              slot_name = slot_name,
              price_chaos = estimated_price,
              before_metrics = baseline_metrics,
              after_metrics = baseline_metrics,
              primary_metric = primary_metric,
              raw_text = trim(stage_item.raw_text),
              trade_link = overview_trade_link,
              trade_link_kind = "pob_weighted_query",
              score_override = 0,
              exact_eval = false,
              evaluation_status = "rejected",
              evaluation_reason = rejected_reason,
              evaluation_reason_key = to_reason_key(rejected_reason),
              evaluation_detail = evaluation.rejected_detail,
              required_source_effects = evaluation.required_source_effects,
              target_stage_order_index = stage_item_index,
              within_budget_limit = within_budget_limit,
              budget_limit_chaos = budget_chaos,
              budget_delta_chaos = budget_delta_chaos,
              locally_positive = false,
            }))
          elseif evaluation and evaluation.metrics then
            evaluated_count = evaluated_count + 1
            local reservation_rejection_reason = get_reservation_rejection_reason(evaluation)
            local breaks_requirements, broken_requirement, flexible_elemental_resistance = breaks_core_defence_requirements(
              baseline_metrics,
              evaluation.metrics,
              {
                allow_flexible_elemental_resistance = true,
                raw_text = trim(evaluation.simulated_raw_text) or trim(stage_item.raw_text),
              }
            )
            local meaningful_gain = has_meaningful_rare_gain(
              baseline_metrics,
              evaluation.metrics,
              primary_metric,
              evaluation
            )
            local resolves_reservation_blocker = evaluation.resolves_reservation_blocker == true
            local unlock_candidate = slot_has_blocker or resolves_reservation_blocker
            local unlock_weight = (slot_has_blocker and 35 or 0) + (resolves_reservation_blocker and 35 or 0)
            local actionable_plan = create_exact_rare_plan({
              base_type = base_type,
              slot_name = slot_name,
              price_chaos = estimated_price,
              before_metrics = baseline_metrics,
              after_metrics = evaluation.metrics,
              primary_metric = primary_metric,
              stage_progress_score = unlock_candidate and 0.95 or 0.7,
              unlock_weight = unlock_weight,
              category = unlock_candidate and "unlock_next_stage" or "best_single",
              raw_text = trim(stage_item.raw_text),
              trade_link = overview_trade_link,
              trade_link_kind = "pob_weighted_query",
              retained_for_incremental_rerun = retain_non_positive and not meaningful_gain,
              flexible_elemental_resistance = flexible_elemental_resistance,
              required_source_effects = evaluation.required_source_effects,
              applied_slot_effects = evaluation.applied_slot_effects,
              reservation_before_delta = evaluation.reservation_before_delta,
              reservation_after_delta = evaluation.reservation_after_delta,
              reservation_delta_gain = evaluation.reservation_delta_gain,
              reservation_status = evaluation.reservation_status,
              reservation_progress_score = evaluation.reservation_progress_score,
              resolves_reservation_blocker = resolves_reservation_blocker,
              target_stage_order_index = stage_item_index,
              budget_limit_chaos = budget_chaos,
              budget_delta_chaos = budget_delta_chaos,
            })
            local actionable_score_breakdown = as_table(as_table(actionable_plan.ranking_reason).score_breakdown)
            local actionable_defensive_or_utility = is_defensive_or_utility_outcome(
              actionable_plan.score,
              safe_number(actionable_score_breakdown.ehp_score),
              evaluation.reservation_progress_score,
              evaluation.required_source_effects
            )
            local locally_positive = (actionable_plan.score or 0) > 0
              and meaningful_gain
              and within_budget_limit
              and not reservation_rejection_reason
              and not breaks_requirements
            local evaluation_status = locally_positive and "accepted"
              or (retain_non_positive and "retained_for_incremental_rerun" or "overview_only")
            local evaluation_reason = nil
            local evaluation_reason_key = nil
            local evaluation_detail = nil
            local overview_breaks_requirements = breaks_requirements

            if reservation_rejection_reason then
              evaluation_status = "rejected"
              evaluation_reason = reservation_rejection_reason
              evaluation_reason_key = to_reason_key(reservation_rejection_reason)
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = reservation_rejection_reason,
                slot = slot_name,
                reservation_status = evaluation.reservation_status,
                reservation_after_delta = evaluation.reservation_after_delta,
              })
            elseif breaks_requirements and broken_requirement then
              evaluation_status = "rejected"
              evaluation_reason = broken_requirement
              evaluation_reason_key = to_reason_key(broken_requirement)
              evaluation_detail = nil
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = broken_requirement,
                slot = slot_name,
              })
              add_warning((trim(stage_item.type_line) or slot_name) .. " was skipped because it would break " .. broken_requirement .. ".")
            elseif not meaningful_gain then
              evaluation_status = "rejected"
              evaluation_reason = "not-meaningful"
              evaluation_reason_key = "not_meaningful"
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "rejected",
                reason = "not-meaningful",
                slot = slot_name,
              })
            elseif not within_budget_limit then
              evaluation_status = "budget_limited"
              evaluation_reason = "over-budget"
              evaluation_reason_key = "over_budget"
              evaluation_detail = string.format("Estimated %d chaos against a %s chaos budget.", estimated_price, tostring(budget_chaos))
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "budget-limited",
                reason = "over-budget",
                slot = slot_name,
                estimated_price = estimated_price,
                budget_chaos = budget_chaos,
              })
            elseif locally_positive or retain_non_positive then
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = locally_positive and "accepted" or "accepted-incremental-rerun",
                slot = slot_name,
                blocker = slot_has_blocker,
                resolves_reservation_blocker = resolves_reservation_blocker,
                reservation_status = evaluation.reservation_status,
                reservation_delta_gain = evaluation.reservation_delta_gain,
                retained_for_incremental_rerun = retain_non_positive and not meaningful_gain,
              })
              if locally_positive or retain_non_positive then
                actionable_plan.ranking_reason.evaluation_status = locally_positive and "accepted" or "retained_for_incremental_rerun"
                actionable_plan.ranking_reason.evaluation_reason = evaluation_reason
                actionable_plan.ranking_reason.evaluation_reason_key = evaluation_reason_key
                actionable_plan.ranking_reason.evaluation_detail = evaluation_detail
                actionable_plan.ranking_reason.exact_score_negative = actionable_plan.score < 0
                actionable_plan.ranking_reason.defensive_or_utility = actionable_defensive_or_utility
                actionable_plan.ranking_reason.locally_positive = locally_positive
                actionable_plan.ranking_reason.within_budget_limit = within_budget_limit
                actionable_plan.ranking_reason.budget_limit_chaos = budget_chaos
                actionable_plan.ranking_reason.budget_delta_chaos = budget_delta_chaos
                actionable_plan.items[1].item_payload.evaluation_status = actionable_plan.ranking_reason.evaluation_status
                actionable_plan.items[1].item_payload.evaluation_reason = evaluation_reason
                actionable_plan.items[1].item_payload.evaluation_reason_key = evaluation_reason_key
                actionable_plan.items[1].item_payload.evaluation_detail = evaluation_detail
                actionable_plan.items[1].item_payload.exact_score_negative = actionable_plan.ranking_reason.exact_score_negative
                actionable_plan.items[1].item_payload.defensive_or_utility = actionable_defensive_or_utility
                actionable_plan.items[1].item_payload.locally_positive = locally_positive
                actionable_plan.items[1].item_payload.within_budget_limit = within_budget_limit
                actionable_plan.items[1].item_payload.budget_limit_chaos = budget_chaos
                actionable_plan.items[1].item_payload.budget_delta_chaos = budget_delta_chaos
                if (actionable_plan.score or 0) > 0 or retain_non_positive then
                  table.insert(plans, actionable_plan)
                end
              end
            else
              evaluation_status = "overview_only"
              evaluation_reason = "score-negative"
              evaluation_reason_key = "score_negative"
              evaluation_detail = "The blended overall score stayed below zero even though the item still changed build metrics."
              log_exact_candidate_result("stage-rare", trim(stage_item.type_line) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = "overview-only",
                reason = "score-negative",
                slot = slot_name,
              })
            end

            local overview_plan = create_stage_rare_overview_plan({
              base_type = base_type,
              slot_name = slot_name,
              price_chaos = estimated_price,
              before_metrics = baseline_metrics,
              after_metrics = evaluation.metrics,
              primary_metric = primary_metric,
              stage_progress_score = actionable_plan and actionable_plan.stage_progress_score or (unlock_candidate and 0.95 or 0.45),
              category = unlock_candidate and "unlock_next_stage" or "best_single",
              raw_text = trim(stage_item.raw_text),
              trade_link = overview_trade_link,
              trade_link_kind = "pob_weighted_query",
              retained_for_incremental_rerun = retain_non_positive and not locally_positive,
              flexible_elemental_resistance = flexible_elemental_resistance,
              required_source_effects = evaluation.required_source_effects,
              applied_slot_effects = evaluation.applied_slot_effects,
              reservation_before_delta = evaluation.reservation_before_delta,
              reservation_after_delta = evaluation.reservation_after_delta,
              reservation_delta_gain = evaluation.reservation_delta_gain,
              reservation_status = evaluation.reservation_status,
              reservation_progress_score = evaluation.reservation_progress_score,
              resolves_reservation_blocker = resolves_reservation_blocker,
              score_override = actionable_plan and actionable_plan.score or nil,
              score_breakdown_override = actionable_plan and as_table(actionable_plan.ranking_reason).score_breakdown or nil,
              exact_eval = true,
              evaluation_status = evaluation_status,
              evaluation_reason = evaluation_reason,
              evaluation_reason_key = evaluation_reason_key,
              evaluation_detail = evaluation_detail,
              within_budget_limit = within_budget_limit,
              budget_limit_chaos = budget_chaos,
              budget_delta_chaos = budget_delta_chaos,
              locally_positive = locally_positive,
              breaks_requirements = overview_breaks_requirements,
              defensive_or_utility = actionable_defensive_or_utility,
              target_stage_order_index = stage_item_index,
            })
            table.insert(overview_plans, overview_plan)
          elseif evaluation_error then
            add_warning((trim(stage_item.type_line) or slot_name) .. " could not be exact-scored: " .. evaluation_error)
            table.insert(overview_plans, create_stage_rare_overview_plan({
              base_type = base_type,
              slot_name = slot_name,
              price_chaos = estimated_price,
              before_metrics = baseline_metrics,
              after_metrics = baseline_metrics,
              primary_metric = primary_metric,
              raw_text = trim(stage_item.raw_text),
              trade_link = overview_trade_link,
              trade_link_kind = "pob_weighted_query",
              score_override = 0,
              exact_eval = false,
              evaluation_status = "error",
              evaluation_reason = "exact-score-failed",
              evaluation_reason_key = "exact_score_failed",
              evaluation_detail = evaluation_error,
              target_stage_order_index = stage_item_index,
              within_budget_limit = within_budget_limit,
              locally_positive = false,
            }))
          end
        else
          log_exact_candidate_skip("stage-rare", trim(stage_item.type_line) or slot_name, {
            reason = "same-as-equipped",
            slot = slot_name,
          })
          table.insert(overview_plans, create_stage_rare_overview_plan({
            base_type = base_type,
            slot_name = slot_name,
            price_chaos = estimated_price,
            before_metrics = baseline_metrics,
            after_metrics = baseline_metrics,
            primary_metric = primary_metric,
            raw_text = trim(stage_item.raw_text),
            trade_link = overview_trade_link,
            trade_link_kind = "pob_weighted_query",
            score_override = 0,
            exact_eval = true,
            evaluation_status = "same_as_equipped",
            evaluation_reason = "same-as-equipped",
            evaluation_reason_key = "same_as_equipped",
            target_stage_order_index = stage_item_index,
            within_budget_limit = within_budget_limit,
            budget_limit_chaos = budget_chaos,
            budget_delta_chaos = budget_delta_chaos,
            locally_positive = false,
          }))
        end
      end
    end
  end

  table.sort(plans, function(left, right)
    if (left.category or "") ~= (right.category or "") then
      return (left.category or "") < (right.category or "")
    end
    return (left.score or 0) > (right.score or 0)
  end)

  plans = select_best_rare_plan_per_slot(plans)

  table.sort(overview_plans, function(left, right)
    local left_index = safe_number(as_table(left and left.ranking_reason).target_stage_order_index) or 999
    local right_index = safe_number(as_table(right and right.ranking_reason).target_stage_order_index) or 999
    if left_index ~= right_index then
      return left_index < right_index
    end
    return (left.score or 0) > (right.score or 0)
  end)

  while #plans > MAX_EXACT_RARE_PLANS_PER_SOURCE do
    table.remove(plans)
  end

  return plans, evaluated_count, overview_plans
end

local function evaluate_exact_market_rare_plans(payload, build_target, target_stage, character_snapshot, baseline_metrics, reservation_audit)
  local rare_candidates = as_table(payload.rare_candidates)
  local hard_requirements = as_table(target_stage.hard_requirements)
  local budget_chaos = get_budget_limit_chaos(payload)
  local primary_metric = normalize_metric_key(target_stage.primary_metric)
  local reservation_before_delta = safe_number(as_table(reservation_audit).reserved_mana_delta)
  local incremental_rerun_slots = build_incremental_rerun_slot_set(payload)
  local incremental_rerun_active = next(incremental_rerun_slots) ~= nil
  local plans = {}
  local evaluated_count = 0
  local seen = {}

  for _, candidate in ipairs(rare_candidates) do
    local slot_name = trim(candidate and candidate.slot)
    local raw_text = trim(candidate and candidate.raw_text)
    local price_chaos = safe_number(candidate and candidate.chaos_value)
    local within_budget_limit = is_within_budget_limit(price_chaos, budget_chaos)
    local budget_delta_chaos = (price_chaos and budget_chaos and price_chaos > budget_chaos)
      and (price_chaos - budget_chaos)
      or 0
    local candidate_label = trim(candidate and candidate.name) or trim(candidate and candidate.base_type) or slot_name
    local dedupe_key = trim(candidate and candidate.trade_result_id)
    if not dedupe_key and slot_name and raw_text then
      dedupe_key = normalize_key(slot_name) and (normalize_key(slot_name) .. "::" .. (normalize_item_text(raw_text) or raw_text)) or nil
    end

    if slot_name
      and raw_text
      and dedupe_key
      and not seen[dedupe_key]
    then
      local slot_match_key = normalize_slot_match_key(slot_name)
      if incremental_rerun_active and not (slot_match_key and incremental_rerun_slots[slot_match_key] == true) then
        log_exact_candidate_skip("market-rare", candidate_label, {
          reason = "incremental-rerun-unchanged-slot",
          slot = slot_name,
        })
        goto continue_market_candidate
      end
      seen[dedupe_key] = true
      local current_item = get_equipped_item_in_slot(character_snapshot, slot_name)
      if not is_same_item_text(current_item and current_item.pob_item_text, raw_text) then
        local slot_context = get_rare_slot_context(slot_name)
        local evaluation, evaluation_error = evaluate_rare_swap(
          build_target,
          target_stage,
          character_snapshot,
          slot_name,
          raw_text,
          {
            slot_context = slot_context,
            reservation_before_delta = reservation_before_delta,
          }
        )

        if evaluation and evaluation.rejected == true then
          log_exact_candidate_skip("market-rare", candidate_label, {
            reason = evaluation.rejected_reason or "rejected",
            slot = slot_name,
            detail = evaluation.rejected_detail,
          })
        elseif evaluation and evaluation.metrics then
          evaluated_count = evaluated_count + 1
          local reservation_rejection_reason = get_reservation_rejection_reason(evaluation)
          local breaks_requirements, broken_requirement, flexible_elemental_resistance = breaks_core_defence_requirements(
            baseline_metrics,
            evaluation.metrics,
            {
              allow_flexible_elemental_resistance = true,
              raw_text = trim(evaluation.simulated_raw_text) or raw_text,
            }
          )
          local meaningful_gain = has_meaningful_rare_gain(
            baseline_metrics,
            evaluation.metrics,
            primary_metric,
            evaluation
          )
          local retain_non_positive = slot_match_key and incremental_rerun_slots[slot_match_key] == true
          if reservation_rejection_reason then
            log_exact_candidate_result("market-rare", trim(candidate and candidate.name) or trim(candidate and candidate.base_type) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
              decision = "rejected",
              reason = reservation_rejection_reason,
              slot = slot_name,
              reservation_status = evaluation.reservation_status,
              reservation_after_delta = evaluation.reservation_after_delta,
            })
          elseif not breaks_requirements and (meaningful_gain or retain_non_positive) then
            local slot_has_blocker = false
            for _, requirement in ipairs(hard_requirements) do
              if normalize_slot_match_key(requirement and requirement.slot) == normalize_slot_match_key(slot_name) then
                slot_has_blocker = true
                break
              end
            end
            local resolves_reservation_blocker = evaluation.resolves_reservation_blocker == true
            local unlock_candidate = slot_has_blocker or resolves_reservation_blocker
            local unlock_weight = (slot_has_blocker and 45 or 0) + (resolves_reservation_blocker and 45 or 0)

              log_exact_candidate_result("market-rare", trim(candidate and candidate.name) or trim(candidate and candidate.base_type) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
                decision = within_budget_limit
                  and (meaningful_gain and "accepted" or "accepted-incremental-rerun")
                  or (meaningful_gain and "accepted-over-budget" or "accepted-incremental-rerun-over-budget"),
                slot = slot_name,
                blocker = slot_has_blocker,
                resolves_reservation_blocker = resolves_reservation_blocker,
                reservation_status = evaluation.reservation_status,
                reservation_delta_gain = evaluation.reservation_delta_gain,
                retained_for_incremental_rerun = retain_non_positive and not meaningful_gain,
                price_chaos = price_chaos,
                budget_chaos = budget_chaos,
              })
              local plan = create_exact_rare_plan({
                base_type = trim(candidate and candidate.base_type),
                item_name = trim(candidate and candidate.name),
                slot_name = slot_name,
                price_chaos = price_chaos,
                before_metrics = baseline_metrics,
                after_metrics = evaluation.metrics,
                primary_metric = primary_metric,
                stage_progress_score = unlock_candidate and 1.05 or 0.85,
                unlock_weight = unlock_weight,
                category = unlock_candidate and "unlock_next_stage" or (candidate.candidate_source == "owned" and "owned_now" or "best_single"),
                trade_link = trim(candidate and candidate.trade_link),
                estimated_price = false,
                candidate_type = candidate.candidate_source == "owned" and "owned_viscera" or "market_rare",
                source = candidate.candidate_source == "owned" and "owned" or "market",
                owned_item_id = candidate.owned_item_id,
                owner_user_id = candidate.owner_user_id,
                title_override = candidate.candidate_source == "owned" and ("Use owned Viscera: " .. slot_name) or nil,
                summary_override = candidate.candidate_source == "owned" and "Exact PoB swap scoring for a retained stash item; no purchase cost." or nil,
                explanation_override = candidate.candidate_source == "owned" and "This Viscera is already in the group's retained stash snapshot. Path of Building evaluated the exact item in the matching Wickerman slot." or nil,
                raw_text = raw_text,
                icon_url = trim(candidate and candidate.icon_url),
                trade_link_kind = trim(candidate and candidate.trade_link_kind) or "trade_search",
                trade_query_id = trim(candidate and candidate.trade_query_id),
                trade_result_id = trim(candidate and candidate.trade_result_id),
                price_source = candidate.candidate_source == "owned" and "owned_stash" or "trade_listing",
                listing_price_amount = safe_number(candidate and candidate.listing_price_amount),
                listing_price_currency = trim(candidate and candidate.listing_price_currency),
                retained_for_incremental_rerun = retain_non_positive and not meaningful_gain,
                flexible_elemental_resistance = flexible_elemental_resistance,
                required_source_effects = evaluation.required_source_effects,
                applied_slot_effects = evaluation.applied_slot_effects,
                reservation_before_delta = evaluation.reservation_before_delta,
                reservation_after_delta = evaluation.reservation_after_delta,
                reservation_delta_gain = evaluation.reservation_delta_gain,
                reservation_status = evaluation.reservation_status,
                reservation_progress_score = evaluation.reservation_progress_score,
                resolves_reservation_blocker = resolves_reservation_blocker,
                within_budget_limit = within_budget_limit,
                budget_limit_chaos = budget_chaos,
                budget_delta_chaos = budget_delta_chaos,
                evaluation_status = within_budget_limit and "accepted" or "accepted_over_budget",
                evaluation_reason = within_budget_limit and nil or "over-budget",
                evaluation_reason_key = within_budget_limit and nil or "over_budget",
                evaluation_detail = within_budget_limit and nil
                  or string.format(
                    "Listed at %d chaos, %d chaos above the current %s chaos budget.",
                    math.floor(price_chaos or 0),
                    math.floor(budget_delta_chaos or 0),
                    tostring(budget_chaos)
                  ),
              })
            if (plan.score or 0) > 0 or retain_non_positive then
              table.insert(plans, plan)
            end
          elseif breaks_requirements and broken_requirement then
            log_exact_candidate_result("market-rare", trim(candidate and candidate.name) or trim(candidate and candidate.base_type) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
              decision = "rejected",
              reason = broken_requirement,
              slot = slot_name,
            })
          else
            log_exact_candidate_result("market-rare", trim(candidate and candidate.name) or trim(candidate and candidate.base_type) or slot_name, baseline_metrics, evaluation.metrics, primary_metric, {
              decision = "rejected",
              reason = "not-meaningful",
              slot = slot_name,
            })
          end
        elseif evaluation_error then
          add_warning((trim(candidate and candidate.base_type) or slot_name) .. " market candidate could not be exact-scored: " .. evaluation_error)
        end
      else
        log_exact_candidate_skip("market-rare", candidate_label, {
          reason = "same-as-equipped",
          slot = slot_name,
        })
      end
    elseif not slot_name or not raw_text then
      log_exact_candidate_skip("market-rare", candidate_label or "unknown", {
        reason = "missing-slot-or-raw-text",
        slot = slot_name,
      })
    elseif not dedupe_key then
      log_exact_candidate_skip("market-rare", candidate_label, {
        reason = "missing-dedupe-key",
        slot = slot_name,
      })
    elseif seen[dedupe_key] then
      log_exact_candidate_skip("market-rare", candidate_label, {
        reason = "duplicate-candidate",
        slot = slot_name,
        dedupe_key = dedupe_key,
      })
    end
    ::continue_market_candidate::
  end

  table.sort(plans, function(left, right)
    if (left.category or "") ~= (right.category or "") then
      return (left.category or "") < (right.category or "")
    end
    return (left.score or 0) > (right.score or 0)
  end)

  plans = select_best_rare_plan_per_slot(plans)

  while #plans > MAX_EXACT_RARE_PLANS_PER_SOURCE do
    table.remove(plans)
  end

  return plans, evaluated_count
end

local ok, runtime_error = xpcall(function()
  local build_target = as_table(payload.build_target)
  local target_stage = as_table(payload.target_stage)
  local character_snapshot = as_table(payload.character_snapshot)
  -- Collect party buff exports once upfront — this clobbers `build` for each party member,
  -- so it must happen before loading the main build.
  precollected_party_buffs = collect_all_party_buffs(payload.party_builds)
  local compare_power_report = nil
  local compare_power_reports = nil
  local current_compare_context = nil
  local current_metrics = nil
  local compare_error = nil
  local compare_ok, report_or_error, context_or_nil, metrics_or_nil, error_or_nil, reports_or_nil = xpcall(function()
    return build_upstream_compare_power_report(build_target, target_stage, character_snapshot)
  end, function(err)
    return debug.traceback(err, 2)
  end)
  if compare_ok then
    compare_power_report = report_or_error
    current_compare_context = context_or_nil
    current_metrics = metrics_or_nil
    compare_error = error_or_nil
    compare_power_reports = reports_or_nil
  else
    compare_error = report_or_error
  end
  if compare_error and tostring(compare_error):find("Current character import failed:", 1, true) then
    stderr_print(tostring(compare_error))
    error("Current character import failed; exact comparison cannot proceed.")
  end
  local baseline_context = initialize_stage_context(build_target, target_stage, character_snapshot)
  -- Ensure staged skills (e.g. Reave) use max stages if the user never set a value in PoB
  if ensure_main_skill_max_stages() then
    rebuild_current_build()
    sync_main_skill_minion_stats_toggle()
  end
  local exact_metrics = collect_metrics()
  if not compare_power_report then
    compare_power_report = build_compare_power_report(target_stage, character_snapshot)
    compare_power_report.source = "misc_calculator_fallback"
    compare_power_report.upstream_error = tostring(compare_error)
    current_metrics = exact_metrics
  end
  local metrics = current_metrics or exact_metrics
  local compare_action_plans = build_compare_action_plans(compare_power_report, metrics)
  local main_skill_metrics_state = get_main_skill_metrics_state()
  local main_skill_stat_scope = should_auto_show_minion_stats(main_skill_metrics_state) and "minion" or "player"

  -- Diagnostics: log which socket group is the main skill and whether party buffs are reflected
  do
    local sg_idx = build.mainSocketGroup or 1
    local sg_list = build.skillsTab and build.skillsTab.socketGroupList or {}
    local sg = sg_list[sg_idx]
    local sg_label = sg and (sg.label or sg.source or "?") or "nil"
    local sg_slot = sg and sg.slot or "?"
    local sg_enabled = sg and sg.enabled
    local display_skill = sg and sg.displaySkillList and sg.displaySkillList[sg.mainActiveSkill or 1]
    local skill_name = display_skill and display_skill.activeEffect and display_skill.activeEffect.grantedEffect and display_skill.activeEffect.grantedEffect.name or "?"
    -- Log key config inputs from the build
    local cfg_sets = build.configTab and build.configTab.configSets or {}
    local active_id = build.configTab and build.configTab.activeConfigSetId or 1
    local cfg = (cfg_sets[active_id] and cfg_sets[active_id].input) or {}
    -- (config diag removed)
    stderr_print(string.format("[diag] mainSocketGroup=%d label=%s slot=%s enabled=%s skill=%s totalDps=%.0f combinedDps=%.0f fullDps=%.0f statScope=%s showMinion=%s overlay=%d",
      sg_idx, tostring(sg_label), tostring(sg_slot), tostring(sg_enabled), tostring(skill_name),
      metrics.totalDps or 0, metrics.combinedDps or 0, metrics.fullDps or 0,
      tostring(main_skill_stat_scope),
      tostring(build.calcsTab and build.calcsTab.input and build.calcsTab.input.showMinion == true),
      baseline_context.equipped_overlay_count or 0))
    -- Log all socket groups so we can see which index is which
    for i, g in ipairs(sg_list) do
      local gname = g.label or g.source or "?"
      local gslot = g.slot or "?"
      local genabled = g.enabled
      stderr_print(string.format("[diag] socketGroup[%d] label=%s slot=%s enabled=%s", i, tostring(gname), tostring(gslot), tostring(genabled)))
    end
    -- Compare MAIN vs CALCS output and log skill-specific fields
    local main_out = build.calcsTab and build.calcsTab.mainOutput
    local main_out_minion = main_out and main_out.Minion or nil
    local calcs_out = build.calcsTab and build.calcsTab.calcsOutput
    local calcs_out_minion = calcs_out and calcs_out.Minion or nil
    local calcs_skill_num = build.calcsTab and build.calcsTab.input and build.calcsTab.input.skill_number or 1
    local calcs_sg = (build.skillsTab and build.skillsTab.socketGroupList or {})[calcs_skill_num]
    local calcs_ds = calcs_sg and calcs_sg.displaySkillList and calcs_sg.displaySkillList[calcs_sg.mainActiveSkillCalcs or calcs_sg.mainActiveSkill or 1]
    local calcs_skill_name = calcs_ds and calcs_ds.activeEffect and calcs_ds.activeEffect.grantedEffect and calcs_ds.activeEffect.grantedEffect.name or "?"
    stderr_print(string.format("[diag] MAIN[sg=%d] dps=%.0f minionDps=%.0f | CALCS[sg=%d skill=%s] dps=%.0f minionDps=%.0f",
      build.mainSocketGroup or 1, safe_number(main_out and main_out.TotalDPS) or 0,
      safe_number(main_out_minion and main_out_minion.TotalDPS) or 0,
      calcs_skill_num, tostring(calcs_skill_name), safe_number(calcs_out and calcs_out.TotalDPS) or 0,
      safe_number(calcs_out_minion and calcs_out_minion.TotalDPS) or 0))
    stderr_print(string.format("[diag] MAIN stageCount=%s dpsMultiplier=%s speed=%s avgDmg=%s",
      tostring(main_out and main_out.SkillStageCount),
      tostring(main_out and main_out.DpsMultiplier),
      tostring(main_out and main_out.Speed),
      tostring(main_out and main_out.AverageDamage)))
  end
  local tree_nodes = build.spec and build.spec.tree and build.spec.tree.nodes or {}
  local available_tree_keystones = collect_available_keystones(tree_nodes)
  local target_tree_keystones = collect_allocated_keystones(build.spec, tree_nodes)
  local current_tree_keystones = collect_profile_keystones(character_snapshot, tree_nodes)
  local reservation_audit = build_reservation_audit(target_stage, baseline_context)
  local exact_unique_plans, evaluated_exact_unique_count = evaluate_exact_stage_unique_plans(
    payload,
    build_target,
    target_stage,
    character_snapshot,
    exact_metrics
  )
  local market_rare_plans, evaluated_market_rare_count = evaluate_exact_market_rare_plans(
    payload,
    build_target,
    target_stage,
    character_snapshot,
    exact_metrics,
    reservation_audit
  )
  local stage_template_rare_plans, evaluated_stage_template_rare_count, stage_template_rare_overview_plans = evaluate_exact_stage_rare_plans(
    payload,
    build_target,
    target_stage,
    character_snapshot,
    exact_metrics,
    reservation_audit
  )
  local combined_rare_plans = {}
  for _, plan in ipairs(as_table(market_rare_plans)) do
    table.insert(combined_rare_plans, plan)
  end
  for _, plan in ipairs(as_table(stage_template_rare_plans)) do
    table.insert(combined_rare_plans, plan)
  end
  local exact_rare_plans = select_best_rare_plan_per_slot(combined_rare_plans)
  local evaluated_exact_rare_count = evaluated_market_rare_count + evaluated_stage_template_rare_count
  local exact_plans = {}
  for _, plan in ipairs(exact_unique_plans) do
    plan.section = "primary"
    table.insert(exact_plans, plan)
  end
  for _, plan in ipairs(exact_rare_plans) do
    plan.section = "primary"
    table.insert(exact_plans, plan)
  end
  table.sort(exact_plans, function(left, right)
    if (left.category or "") ~= (right.category or "") then
      return (left.category or "") < (right.category or "")
    end
    return (left.score or 0) > (right.score or 0)
  end)
  local overview_plans = nil
  if #as_table(stage_template_rare_overview_plans) > 0 then
    overview_plans = {}
    for _, plan in ipairs(as_table(stage_template_rare_overview_plans)) do
      local copy = shallow_copy(plan)
      copy.section = "overview"
      table.insert(overview_plans, copy)
    end
  end
  local recommendation_plans = #exact_plans > 0 and exact_plans or compare_action_plans
  local recommendation_source = #exact_plans > 0 and "exact_swap" or "compare_power_report"
  local output_overview_plans = nil
  if recommendation_source ~= "compare_power_report" then
    output_overview_plans = overview_plans
  end
  local partial_reason = nil
  local run_status = "completed"
  if recommendation_source == "exact_swap" and #exact_plans > 0 then
    run_status = "partial"
    if #market_rare_plans > 0 then
      partial_reason = "This run includes exact PoB-scored unique and live market rare single-item upgrades. Multi-item bundles and broader rare search are still pending."
    elseif #stage_template_rare_plans > 0 or evaluated_stage_template_rare_count > 0 then
      partial_reason = "This run includes exact PoB-scored unique upgrades plus exact stage-template rare refinement candidates. Use rerun inputs to relax the target search for those rare slots. Broader live rare search and bundles are still pending."
    else
      partial_reason = "This run includes exact PoB-scored unique upgrades. Broader live rare search and bundles are still pending."
    end
  end

  if not as_table(as_table(character_snapshot.current_import).completeness).equipment
    or not as_table(as_table(character_snapshot.current_import).completeness).passives then
    run_status = "partial"
    partial_reason = "Current source does not establish equipment or passive-tree completeness; comparison is incomplete."
  end
  if #as_table(as_table(character_snapshot.current_import).unsupported_flags) > 0 then
    run_status = "partial"
    partial_reason = "Current input includes modifier flags whose support is unverified in this PoB revision."
  end
  if not as_table(as_table(character_snapshot.current_import).completeness).wickerman then
    run_status = "partial"
    partial_reason = "Current source does not establish Wickerman completeness; current-character comparison is incomplete."
  end

  stderr_print(string.format(
    "[exact][summary] status=%s source=%s plan_count=%d compare_plans=%d unique_plans=%d unique_evaluated=%d market_rare_plans=%d market_rare_evaluated=%d stage_rare_plans=%d stage_rare_evaluated=%d warnings=%d",
    tostring(run_status),
    tostring(recommendation_source),
    #recommendation_plans,
    #compare_action_plans,
    #exact_unique_plans,
    evaluated_exact_unique_count,
    #market_rare_plans,
    evaluated_market_rare_count,
    #stage_template_rare_plans,
    evaluated_stage_template_rare_count,
    #warnings
  ))
  for index, warning in ipairs(warnings) do
    stderr_print(string.format("[exact][warning][%d] %s", index, tostring(warning)))
  end

  encode_and_exit({
    status = run_status,
    partialReason = partial_reason,
    summary = {
      runtime = "pob-luajit",
      pob_ref = os.getenv("POB_REF"),
      input_completeness = as_table(as_table(character_snapshot.current_import).completeness),
      unsupported_flags = as_table(as_table(character_snapshot.current_import).unsupported_flags),
      pob_compare_available = detect_compare_capability(),
      baseline_metrics = metrics,
      compare_power_report = compare_power_report,
      compare_power_reports = compare_power_reports,
      recommendation_source = recommendation_source,
      compare_action_plan_count = #compare_action_plans,
      resolved_tree_spec_id = baseline_context.resolved_tree_spec_id,
      resolved_tree_spec_title = trim(baseline_context.active_tree_spec and baseline_context.active_tree_spec.title),
      resolved_item_set_id = baseline_context.resolved_item_set_id,
      resolved_item_set_title = trim(baseline_context.active_item_set and baseline_context.active_item_set.title),
      resolved_skill_set_id = baseline_context.resolved_skill_set_id,
      resolved_skill_set_title = trim(baseline_context.active_skill_set and baseline_context.active_skill_set.title),
      resolved_config_set_id = baseline_context.resolved_config_set_id,
      resolved_config_set_title = trim(baseline_context.active_config_set and baseline_context.active_config_set.title),
      resolved_config_set_source = baseline_context.resolved_config_set_source,
      use_second_weapon_set = baseline_context.active_item_set and baseline_context.active_item_set.useSecondWeaponSet or false,
      equipped_overlay_count = baseline_context.equipped_overlay_count,
      applied_party_count = baseline_context.applied_party_count,
      main_skill_name = (function()
        local sg_list = build.skillsTab and build.skillsTab.socketGroupList or nil
        if not sg_list then return nil end
        local sg = sg_list[build.mainSocketGroup or 1]
        if not sg then return nil end
        local main_idx = sg.mainActiveSkill or 1
        local display_skill = sg.displaySkillList and sg.displaySkillList[main_idx]
        if not display_skill then return nil end
        return trim(display_skill.activeEffect and display_skill.activeEffect.grantedEffect and display_skill.activeEffect.grantedEffect.name)
          or trim(display_skill.activeEffect and display_skill.activeEffect.srcInstance and display_skill.activeEffect.srcInstance.skillName)
      end)(),
      main_skill_has_minion = main_skill_metrics_state.has_minion,
      show_minion_stats = should_auto_show_minion_stats(main_skill_metrics_state),
      main_skill_stat_scope = main_skill_stat_scope,
      party_effects = baseline_context.party_effects,
      configuration_selection = baseline_context.configuration_selection,
      configuration_insights = baseline_context.configuration_insights,
      available_tree_keystones = available_tree_keystones,
      target_tree_keystones = target_tree_keystones,
      current_tree_keystones = current_tree_keystones,
      reservation_audit = reservation_audit,
      exact_plan_count = #exact_plans,
      exact_unique_plan_count = #exact_unique_plans,
      exact_unique_evaluated_count = evaluated_exact_unique_count,
      exact_rare_plan_count = #exact_rare_plans,
      exact_rare_evaluated_count = evaluated_exact_rare_count,
      exact_market_rare_plan_count = #market_rare_plans,
      exact_market_rare_evaluated_count = evaluated_market_rare_count,
      exact_stage_template_rare_plan_count = #stage_template_rare_plans,
      exact_stage_template_rare_evaluated_count = evaluated_stage_template_rare_count,
      rare_candidate_count = table_length(payload.rare_candidates),
      overview_plan_count = output_overview_plans and #output_overview_plans or 0,
      warning_count = #warnings,
      warnings = warnings,
    },
    plans = recommendation_plans,
    overview_plans = output_overview_plans,
  }, 0)
end, function(err)
  return debug.traceback(err, 2)
end)

if not ok then
  encode_and_exit({
    status = "failed",
    partialReason = "PoB runtime failed while evaluating the build.",
    summary = {
      runtime = "pob-luajit",
      pob_ref = os.getenv("POB_REF"),
      warnings = warnings,
      error = runtime_error,
    },
    plans = {},
  }, 1)
end
