/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsType } from '@common/data'
import events from '@common/events'
import { IFindItem, IFindPosition, IFindShowSourceParam } from '@common/types'
import { useDebounce, useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import {
  IoArrowBackOutline,
  IoArrowForwardOutline,
  IoChevronDownOutline,
  IoPencil,
  IoSearch,
} from 'react-icons/io5'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import scrollIntoView from 'smooth-scroll-into-view-if-needed'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import styles from './find.module.scss'
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Input,
  Loader,
  Space,
  Stack,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core'

interface IFindPositionShow extends IFindPosition {
  item_id: string
  item_title: string
  item_type: HostsType
  index: number
  is_disabled?: boolean
  is_readonly?: boolean
}

const find = () => {
  const { lang, i18n, setLocale } = useI18n()
  const { configs, loadConfigs } = useConfigs()
  const theme = useMantineTheme()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const [keyword, setKeyword] = useState('')
  const [replace_to, setReplaceTo] = useState('')
  const [is_regexp, setIsRegExp] = useState(false)
  const [is_ignore_case, setIsIgnoreCase] = useState(false)
  const [find_result, setFindResult] = useState<IFindItem[]>([])
  const [find_positions, setFindPositions] = useState<IFindPositionShow[]>([])
  const [is_searching, setIsSearching] = useState(false)
  const [current_result_idx, setCurrentResultIdx] = useState(0)
  const [last_scroll_result_idx, setlastScrollResultIdx] = useState(-1)
  const debounced_keyword = useDebounce(keyword, { wait: 500 })
  const ref_result_box = useRef<HTMLDivElement>(null)

  const init = async () => {
    if (!configs) return

    setLocale(configs.locale)

    let theme = configs.theme
    let cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/gi, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
  }

  useEffect(() => {
    if (!configs) return
    init().catch((e) => console.error(e))
    console.log(configs.theme)
    if (colorScheme !== configs.theme) {
      toggleColorScheme(configs.theme)
    }
  }, [configs])

  useEffect(() => {
    console.log(lang.find_and_replace)
    document.title = lang.find_and_replace
  }, [lang])

  useEffect(() => {
    doFind(debounced_keyword)
  }, [debounced_keyword, is_regexp, is_ignore_case])

  useOnBroadcast(events.config_updated, loadConfigs)

  useOnBroadcast(events.close_find, () => {
    console.log('on close find...')
    setFindResult([])
    setFindPositions([])
    setKeyword('')
    setReplaceTo('')
    setIsRegExp(false)
    setIsIgnoreCase(false)
    setCurrentResultIdx(-1)
    setlastScrollResultIdx(-1)
  })

  const parsePositionShow = (find_items: IFindItem[]) => {
    let positions_show: IFindPositionShow[] = []

    find_items.map((item) => {
      let { item_id, item_title, item_type, positions } = item
      positions.map((p, index) => {
        positions_show.push({
          item_id,
          item_title,
          item_type,
          ...p,
          index,
          is_readonly: item_type !== 'local',
        })
      })
    })

    setFindPositions(positions_show)
  }

  const { run: doFind } = useDebounceFn(
    async (v: string) => {
      console.log('find by:', v)
      if (!v) {
        setFindResult([])
        return
      }

      setIsSearching(true)
      let result = await actions.findBy(v, {
        is_regexp,
        is_ignore_case,
      })
      setCurrentResultIdx(0)
      setlastScrollResultIdx(0)
      setFindResult(result)
      parsePositionShow(result)
      setIsSearching(false)

      await actions.findAddHistory({
        value: v,
        is_regexp,
        is_ignore_case,
      })
    },
    { wait: 500 },
  )

  const toShowSource = async (result_item: IFindPositionShow) => {
    // console.log(result_item)
    await actions.cmdFocusMainWindow()
    agent.broadcast(
      events.show_source,
      lodash.pick<IFindShowSourceParam>(result_item, [
        'item_id',
        'start',
        'end',
        'match',
        'line',
        'line_pos',
        'end_line',
        'end_line_pos',
      ]),
    )
  }

  const replaceOne = async () => {
    let pos: IFindPositionShow = find_positions[current_result_idx]
    if (!pos) return

    setFindPositions([
      ...find_positions.slice(0, current_result_idx),
      {
        ...pos,
        is_disabled: true,
      },
      ...find_positions.slice(current_result_idx + 1),
    ])

    if (replace_to) {
      actions.findAddReplaceHistory(replace_to).catch((e) => console.error(e))
    }

    let r = find_result.find((i) => i.item_id === pos.item_id)
    if (!r) return
    let splitters = r.splitters
    let sp = splitters[pos.index]
    if (!sp) return
    sp.replace = replace_to

    const content = splitters
      .map((sp) => `${sp.before}${sp.replace ?? sp.match}${sp.after}`)
      .join('')
    await actions.setHostsContent(pos.item_id, content)
    agent.broadcast(events.hosts_refreshed_by_id, pos.item_id)

    if (current_result_idx < find_positions.length - 1) {
      setCurrentResultIdx(current_result_idx + 1)
    }
  }

  const replaceAll = async () => {
    for (let item of find_result) {
      let { item_id, item_type, splitters } = item
      if (item_type !== 'local' || splitters.length === 0) continue
      const content = splitters.map((sp) => `${sp.before}${replace_to}${sp.after}`).join('')
      await actions.setHostsContent(item_id, content)
      agent.broadcast(events.hosts_refreshed_by_id, item_id)
    }

    setFindPositions(
      find_positions.map((pos) => ({
        ...pos,
        is_disabled: !pos.is_readonly,
      })),
    )

    if (replace_to) {
      actions.findAddReplaceHistory(replace_to).catch((e) => console.error(e))
    }
  }

  const ResultRow = (row_data: ListChildComponentProps) => {
    const data = find_positions[row_data.index]
    const el = useRef<HTMLDivElement>(null)
    const is_selected = current_result_idx === row_data.index

    useEffect(() => {
      if (el.current && is_selected && current_result_idx !== last_scroll_result_idx) {
        setlastScrollResultIdx(current_result_idx)
        scrollIntoView(el.current, {
          behavior: 'smooth',
          scrollMode: 'if-needed',
        }).catch((e) => console.error(e))
      }
    }, [el, current_result_idx, last_scroll_result_idx])

    return (
      <div
        style={row_data.style}
        className={clsx(
          styles.result_row,
          is_selected && styles.selected,
          data.is_disabled && styles.disabled,
          data.is_readonly && styles.readonly,
        )}
        // borderBottomWidth={1}
        // borderBottomColor={configs?.theme === 'dark' ? 'gray.600' : 'gray.200'}
        onClick={() => {
          setCurrentResultIdx(row_data.index)
        }}
        onDoubleClick={() => toShowSource(data)}
        ref={el}
        title={lang.to_show_source}
      >
        <div className={styles.result_content}>
          {data.is_readonly ? <span className={styles.read_only}>{lang.read_only}</span> : null}
          <span>{data.before}</span>
          <span className={styles.highlight}>{data.match}</span>
          <span>{data.after}</span>
        </div>
        <div className={styles.result_title}>
          <ItemIcon type={data.item_type} />
          <span>{data.item_title}</span>
        </div>
        <div className={styles.result_line}>{data.line}</div>
      </div>
    )
  }

  const showKeywordHistory = async () => {
    let history = await actions.findGetHistory()
    if (history.length === 0) return

    let menu = new PopupMenu(
      history.reverse().map((i) => ({
        label: i.value,
        click() {
          setKeyword(i.value)
          setIsRegExp(i.is_regexp)
          setIsIgnoreCase(i.is_ignore_case)
        },
      })),
    )

    menu.show()
  }

  const showReplaceHistory = async () => {
    let history = await actions.findGetReplaceHistory()
    if (history.length === 0) return

    let menu = new PopupMenu(
      history.reverse().map((v) => ({
        label: v,
        click() {
          setReplaceTo(v)
        },
      })),
    )

    menu.show()
  }

  let can_replace = true
  if (current_result_idx > -1) {
    let pos = find_positions[current_result_idx]
    if (pos?.is_disabled || pos?.is_readonly) {
      can_replace = false
    }
  }

  return (
    <div className={styles.root}>
      <Stack spacing={0} h="100%">
        <div className={styles.ln}>
          <Group spacing={4} onClick={showKeywordHistory}>
            <IoSearch />
            <IoChevronDownOutline style={{ fontSize: 10 }} />
          </Group>
          <Input
            className={styles.ipt}
            autoFocus={true}
            placeholder="keywords"
            variant="filled"
            value={keyword}
            size={'xs'}
            onChange={(e) => {
              setKeyword(e.target.value)
            }}
          />
        </div>

        <div className={styles.ln}>
          <Group spacing={4} onClick={showReplaceHistory}>
            <IoPencil />
            <IoChevronDownOutline style={{ fontSize: 10 }} />
          </Group>
          <Input
            className={styles.ipt}
            placeholder="replace to"
            variant="filled"
            value={replace_to}
            size={'xs'}
            onChange={(e) => {
              setReplaceTo(e.target.value)
            }}
          />
        </div>

        <div className={styles.ln}>
          <Checkbox
            checked={is_regexp}
            onChange={(e) => setIsRegExp(e.target.checked)}
            label={lang.regexp}
          />
          <Space w={20} />
          <Checkbox
            checked={is_ignore_case}
            onChange={(e) => setIsIgnoreCase(e.target.checked)}
            label={lang.ignore_case}
          />
        </div>

        <div className={styles.result_row}>
          <div>{lang.match}</div>
          <div>{lang.title}</div>
          <div>{lang.line}</div>
        </div>

        <Box
          w="100%"
          sx={{ flex: 1 }}
          bg={configs?.theme === 'dark' ? theme.colors.gray[7] : theme.colors.gray[1]}
          ref={ref_result_box}
        >
          <List
            width={'100%'}
            height={ref_result_box.current ? ref_result_box.current.clientHeight : 0}
            itemCount={find_positions.length}
            itemSize={28}
          >
            {ResultRow}
          </List>
        </Box>

        <Group
          h={40}
          px={16}
          spacing={4}
          // justifyContent="flex-end"
        >
          {is_searching ? (
            <Loader />
          ) : (
            <span>
              {i18n.trans(find_positions.length > 1 ? 'items_found' : 'item_found', [
                find_positions.length.toLocaleString(),
              ])}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Button
            size="xs"
            variant="outline"
            disabled={is_searching || find_positions.length === 0}
            onClick={replaceAll}
          >
            {lang.replace_all}
          </Button>
          <Button
            size="xs"
            disabled={is_searching || find_positions.length === 0 || !can_replace}
            onClick={replaceOne}
          >
            {lang.replace}
          </Button>

          <Button.Group>
            <ActionIcon
              aria-label="previous"
              onClick={() => {
                let idx = current_result_idx - 1
                if (idx < 0) idx = 0
                setCurrentResultIdx(idx)
              }}
              disabled={is_searching || find_positions.length === 0 || current_result_idx <= 0}
            >
              <IoArrowBackOutline />
            </ActionIcon>
            <ActionIcon
              aria-label="next"
              onClick={() => {
                let idx = current_result_idx + 1
                if (idx > find_positions.length - 1) idx = find_positions.length - 1
                setCurrentResultIdx(idx)
              }}
              disabled={
                is_searching ||
                find_positions.length === 0 ||
                current_result_idx >= find_positions.length - 1
              }
            >
              <IoArrowForwardOutline />
            </ActionIcon>
          </Button.Group>
        </Group>
      </Stack>
    </div>
  )
}

export default find
