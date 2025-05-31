import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
    Package, ShoppingCart, TrendingUp, Users, Settings,
    Home, Box, FileText, BarChart3, Bell, Search, Plus,
    Filter, Download, Eye, Edit, Trash2, AlertCircle,
    CheckCircle, Clock, DollarSign, Store, TrendingDown,
    RefreshCw, Upload, ChevronDown, User,
    Lock, Save, Loader,
    Check, X,
    ChevronLeft, Star, Tag, Info, ExternalLink, Edit3,
    AlertTriangle
} from 'lucide-react';

const MarketplaceManagementSystem = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedMarketplace, setSelectedMarketplace] = useState('all');
    const [dateRange, setDateRange] = useState('week');
    const [loading, setLoading] = useState(false);
    const [apiKeys, setApiKeys] = useState({
        wildberries: '',
        ozon: { clientId: '', apiKey: '' },
        yandex: ''
    });

    const [pageSize, setPageSize] = useState(50);
    const [customPageSize, setCustomPageSize] = useState('');
    const [showCustomPageSize, setShowCustomPageSize] = useState(false);
    const [searchFilters, setSearchFilters] = useState({
        withPhoto: -1, // -1: все, 0: без фото, 1: с фото
        textSearch: '',
        showOnlyWithStock: false,
        showOnlyActive: false,
        sortBy: 'updatedAt', // updatedAt, createdAt, nmID
        sortOrder: 'desc' // desc, asc
    });

    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    const [apiErrors, setApiErrors] = useState([]);
    const [lastSync, setLastSync] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreProducts, setHasMoreProducts] = useState(true);
    const [productsCursor, setProductsCursor] = useState(null);
    const [totalProducts, setTotalProducts] = useState(0);

    // Состояние для карточки товара
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productDetails, setProductDetails] = useState(null);
    const [loadingProductDetails, setLoadingProductDetails] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedProduct, setEditedProduct] = useState(null);
    const [categoryCharacteristics, setCategoryCharacteristics] = useState([]);
    const [savingProduct, setSavingProduct] = useState(false);

    const logApiError = (error, marketplace) => {
        const errorEntry = {
            id: Date.now(),
            timestamp: new Date().toLocaleString('ru-RU'),
            marketplace,
            error: error.message,
            timestamp_raw: new Date()
        };

        setApiErrors(prev => [errorEntry, ...prev.slice(0, 9)]); // Храним только последние 10 ошибок
    };

    const clearApiErrors = () => {
        setApiErrors([]);
    };

    const [userProfile, setUserProfile] = useState({
        name: 'Иван Петров',
        email: 'admin@marketplace.ru',
        phone: '+7 (999) 123-45-67',
        company: 'ООО "Торговый Дом"',
        inn: '1234567890',
        tariff: 'professional',
        apiUsage: { current: 45000, limit: 100000 },
        balance: 15750
    });

    // API функции Wildberries
    const WB_API_BASE = {
        content: 'https://content-api.wildberries.ru',
        marketplace: 'https://marketplace-api.wildberries.ru',
        statistics: 'https://statistics-api.wildberries.ru',
        prices: 'https://prices-api.wildberries.ru'
    };

    // Лимиты API Wildberries
    const WB_API_LIMITS = {
        content: 100, // запросов в минуту для контента
        marketplace: 300, // запросов в минуту для маркетплейса
        prices: 100, // запросов в минуту для цен
        maxProductsPerRequest: 100, // максимум товаров за один запрос
        maxTotalProducts: 1000 // максимум товаров для загрузки за раз
    };

    // Состояния для массового редактирования
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [showBulkEditModal, setShowBulkEditModal] = useState(false);
    const [bulkEditData, setBulkEditData] = useState({
        brand: { enabled: false, value: '' },
        price: { enabled: false, value: 0 },
        dimensions: {
            enabled: false,
            value: { length: '', width: '', height: '' }
        },
        characteristics: []
    });
    const [bulkEditMode, setBulkEditMode] = useState('common'); // 'common' или 'category'
    const [selectedCategoryForBulk, setSelectedCategoryForBulk] = useState(null);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });

    const makeWBRequest = async (url, options = {}) => {
        const defaultHeaders = {
            'Authorization': `Bearer ${apiKeys.wildberries}`,
            'Content-Type': 'application/json'
        };

        console.log('WB API Request:', { url, options: { ...options, body: options.body } });

        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...defaultHeaders, ...options.headers }
            });

            console.log('WB API Response Status:', response.status, response.statusText);

            if (!response.ok) {
                // Попытаемся получить детальную ошибку
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    errorDetails = JSON.stringify(errorData, null, 2);
                    console.error('WB API Error Details:', errorData);
                } catch (parseError) {
                    const errorText = await response.text();
                    errorDetails = errorText;
                    console.error('WB API Error Text:', errorText);
                }

                throw new Error(`WB API Error: ${response.status} ${response.statusText}\nDetails: ${errorDetails}`);
            }

            const data = await response.json();
            console.log('WB API Success Response:', data);
            return data;
        } catch (fetchError) {
            console.error('WB API Fetch Error:', fetchError);
            throw fetchError;
        }
    };

    // Задержка между запросами для соблюдения лимитов API
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Получение цен товаров WB через новый API
    const fetchWBPrices = async (nmIds) => {
        try {
            if (!nmIds || nmIds.length === 0) return {};

            console.log(`Получаем цены для ${nmIds.length} товаров:`, nmIds);

            const pricesMap = {};

            // Пробуем получить цены через карточки товаров (самый надежный способ)
            try {
                const cardsResponse = await makeWBRequest(`${WB_API_BASE.content}/content/v2/get/cards/list`, {
                    method: 'POST',
                    body: JSON.stringify({
                        settings: {
                            cursor: { limit: nmIds.length },
                            filter: {
                                nmID: nmIds,
                                withPhoto: -1
                            }
                        }
                    })
                });

                if (cardsResponse?.cards) {
                    cardsResponse.cards.forEach(card => {
                        if (card.nmID && card.sizes && card.sizes.length > 0) {
                            // Берем первую цену из размеров
                            const price = card.sizes[0].price || 0;

                            // Попробуем найти скидку в данных карточки
                            let discount = 0;
                            if (card.sizes[0].discountedPrice && card.sizes[0].price) {
                                discount = Math.round(((card.sizes[0].price - card.sizes[0].discountedPrice) / card.sizes[0].price) * 100);
                            }

                            pricesMap[card.nmID] = {
                                price: price,
                                discountedPrice: card.sizes[0].discountedPrice || price,
                                discount: discount
                            };
                        }
                    });
                }

                console.log(`Получены цены из карточек для ${Object.keys(pricesMap).length} товаров`);
            } catch (cardsError) {
                console.warn('Не удалось получить цены через карточки:', cardsError);
            }

            // Если не все цены получены, пробуем через API статистики (альтернативный метод)
            const missingNmIds = nmIds.filter(id => !pricesMap[id]);

            if (missingNmIds.length > 0 && WB_API_BASE.statistics) {
                console.log(`Пробуем получить цены для ${missingNmIds.length} товаров через API статистики`);

                try {
                    // Получаем данные за последний день
                    const dateFrom = new Date();
                    dateFrom.setDate(dateFrom.getDate() - 1);
                    const dateFromISO = dateFrom.toISOString().split('T')[0];

                    console.log('Запрос к API Статистики с dateFrom:', dateFromISO);

                    // URL для запроса статистики. Если используете прокси, измените WB_API_BASE.statistics
                    const statsUrl = `${WB_API_BASE.statistics}/api/v1/supplier/stocks?dateFrom=${dateFromISO}`;
                    // Важно! API статистики WB /api/v1/supplier/stocks принимает dateFrom как query параметр, а не заголовок!
                    // Спецификация для этого API: https://openapi.wildberries.ru/statistics/api/ru/#tag/Statistika/paths/~1api~1v1~1supplier~1stocks/get
                    // Она показывает `dateFrom` в `query`.

                    const statsResponse = await makeWBRequest(statsUrl, {
                        method: 'GET',
                        // headers: { // Убираем dateFrom из заголовков для этого конкретного API
                        //    'dateFrom': dateFromISO // <- Это было причиной CORS ошибки
                        // }
                    });

                    if (statsResponse && Array.isArray(statsResponse)) {
                        statsResponse.forEach(item => {
                            // В ответе /api/v1/supplier/stocks обычно есть поля price и discount
                            if (item.nmId && !pricesMap[item.nmId]) {
                                // Используем поля из ответа статистики, если они есть
                                // Примерные поля из API статистики (могут отличаться, проверяйте ответ):
                                // item.price - цена без скидки
                                // item.discount - скидка в %
                                // item.totalPrice - цена со скидкой
                                // item.finishedPrice - финальная цена (может включать доп. скидки WB)

                                let price = item.price || 0;
                                let discount = item.discount || 0;
                                let discountedPrice = item.price * (1 - (item.discount / 100)); // Рассчитываем, если нет totalPrice

                                if (item.totalPrice) { // Если есть totalPrice, используем его
                                    discountedPrice = item.totalPrice;
                                } else if (item.finishedPrice) { // Как запасной вариант
                                    discountedPrice = item.finishedPrice;
                                }

                                // Убедимся, что скидка не отрицательная
                                if (price > 0 && discountedPrice < price) {
                                    discount = Math.round(((price - discountedPrice) / price) * 100);
                                } else {
                                    discount = 0; // Если цена со скидкой равна или больше
                                }


                                pricesMap[item.nmId] = {
                                    price: price,
                                    discountedPrice: discountedPrice,
                                    discount: discount
                                };
                            }
                        });
                        console.log('Цены из API статистики получены:', pricesMap);
                    }
                } catch (statsError) {
                    console.warn('Не удалось получить цены через API статистики:', statsError);
                    // Если ошибка CORS, то это значит, что сервер все еще блокирует,
                    // либо что-то не так с прокси (если он настроен).
                    // Если другая ошибка, логируем ее.
                    if (statsError.message.includes('CORS')) {
                        logApiError(new Error('CORS_BLOCK_STATISTICS_API: ' + statsError.message), 'Wildberries');
                    } else {
                        logApiError(statsError, 'Wildberries (API Статистики)');
                    }
                }
            }

            console.log(`Итого получены цены для ${Object.keys(pricesMap).length} товаров из ${nmIds.length}`);

            // Для товаров без цен устанавливаем нулевые значения
            nmIds.forEach(nmId => {
                if (!pricesMap[nmId]) {
                    pricesMap[nmId] = {
                        price: 0,
                        discountedPrice: 0,
                        discount: 0
                    };
                }
            });

            return pricesMap;

        } catch (error) {
            console.warn('Общая ошибка получения цен:', error);
            // Возвращаем пустые цены для всех товаров
            const emptyPrices = {};
            nmIds.forEach(nmId => {
                emptyPrices[nmId] = {
                    price: 0,
                    discountedPrice: 0,
                    discount: 0
                };
            });
            return emptyPrices;
        }
    };

    // Получение характеристик категории по ID предмета
    const fetchCategoryCharacteristicsBySubjectId = async (subjectId) => {
        try {
            const response = await makeWBRequest(`${WB_API_BASE.content}/content/v2/object/charcs/${subjectId}`);
            console.log('Raw характеристики категории:', response);

            // Проверяем формат ответа и извлекаем массив характеристик
            let characteristics = [];

            if (response) {
                // Если response это массив
                if (Array.isArray(response)) {
                    characteristics = response;
                }
                // Если response это объект с полем data
                else if (response.data && Array.isArray(response.data)) {
                    characteristics = response.data;
                }
                // Если response это объект с полем characteristics
                else if (response.characteristics && Array.isArray(response.characteristics)) {
                    characteristics = response.characteristics;
                }
                // Если response это объект с полем result
                else if (response.result && Array.isArray(response.result)) {
                    characteristics = response.result;
                }
                // Если response это объект со свойствами характеристик
                else if (typeof response === 'object' && !Array.isArray(response)) {
                    // Пробуем извлечь характеристики из объекта
                    const keys = Object.keys(response);
                    if (keys.length > 0 && typeof response[keys[0]] === 'object') {
                        // Возможно, это объект где ключи - это ID характеристик
                        characteristics = Object.entries(response).map(([key, value]) => ({
                            id: key,
                            ...value
                        }));
                    }
                }
            }

            console.log('Обработанные характеристики категории:', characteristics);
            return characteristics;
        } catch (error) {
            console.warn(`Ошибка получения характеристик для предмета ${subjectId}:`, error);
            return [];
        }
    };

    // Получение детальной информации о товаре
    const fetchProductDetails = async (product) => {
        setLoadingProductDetails(true);
        try {
            // Получаем детальную карточку товара
            const cardResponse = await makeWBRequest(`${WB_API_BASE.content}/content/v2/get/cards/list`, {
                method: 'POST',
                body: JSON.stringify({
                    settings: {
                        cursor: { limit: 1 },
                        filter: { textSearch: product.nmID.toString(), withPhoto: -1 }
                    }
                })
            });

            const cardData = cardResponse?.cards?.[0];
            if (!cardData) {
                throw new Error('Карточка товара не найдена');
            }

            console.log('Данные карточки:', cardData);

            // Пытаемся получить цены для конкретного товара
            let priceInfo = {};
            try {
                const pricesMap = await fetchWBPrices([product.nmID]);
                priceInfo = pricesMap[product.nmID] || {};
            } catch (priceError) {
                console.warn('Не удалось получить цены для товара:', priceError);
            }

            // Получаем характеристики категории для полного списка доступных полей
            let allCharacteristics = [];
            if (cardData.subjectID) {
                try {
                    const charResponse = await fetchCategoryCharacteristicsBySubjectId(cardData.subjectID);
                    // Убеждаемся, что это массив
                    allCharacteristics = Array.isArray(charResponse) ? charResponse : [];
                    setCategoryCharacteristics(allCharacteristics);
                    console.log('Все характеристики категории:', allCharacteristics);
                } catch (charError) {
                    console.warn('Не удалось получить характеристики категории:', charError);
                    allCharacteristics = [];
                }
            }

            // Извлекаем существующие характеристики из карточки
            const existingCharacteristics = {};
            if (cardData?.characteristics && Array.isArray(cardData.characteristics)) {
                cardData.characteristics.forEach(char => {
                    // Поддерживаем разные форматы ID
                    const charId = char.id || char.charcID || char.charId || char.name;
                    if (charId) {
                        existingCharacteristics[charId] = {
                            id: charId,
                            name: char.name || char.charName || 'Неизвестная характеристика',
                            value: Array.isArray(char.value) ? char.value : [char.value || ''],
                            unitName: char.unitName || char.unit || null
                        };
                    }
                });
            }

            console.log('Существующие характеристики:', existingCharacteristics);

            // Объединяем с полным списком характеристик категории
            let allCharacteristicsData = [];

            if (allCharacteristics.length > 0) {
                // Если есть характеристики категории, используем их
                allCharacteristicsData = allCharacteristics.map(char => {
                    const charId = char.id || char.charcID;
                    const existing = existingCharacteristics[charId];
                    return {
                        id: charId,
                        name: char.name || 'Характеристика',
                        required: char.required || false,
                        unitName: char.unitName,
                        maxCount: char.maxCount || 1,
                        popular: char.popular || false,
                        charcType: char.charcType || 1,
                        value: existing ? existing.value : []
                    };
                });
            } else if (Object.keys(existingCharacteristics).length > 0) {
                // Если нет характеристик категории, но есть существующие - используем их
                allCharacteristicsData = Object.values(existingCharacteristics).map(char => ({
                    id: char.id,
                    name: char.name,
                    required: false,
                    unitName: char.unitName,
                    value: char.value,
                    popular: false
                }));
            }

            // Добавляем существующие характеристики, которых нет в списке категории
            Object.entries(existingCharacteristics).forEach(([charId, char]) => {
                if (!allCharacteristicsData.find(c => c.id === charId)) {
                    allCharacteristicsData.push({
                        id: charId,
                        name: char.name,
                        required: false,
                        unitName: char.unitName,
                        value: char.value,
                        popular: false
                    });
                }
            });

            console.log('Все характеристики для отображения:', allCharacteristicsData);

            // Получаем размеры и их характеристики
            const sizes = cardData?.sizes || [];
            const sizesInfo = sizes.map(size => ({
                techSize: size.techSize || '',
                wbSize: size.wbSize || '',
                skus: size.skus || [],
                price: size.price || 0,
                chrtID: size.chrtID
            }));

            // Получаем основную цену из первого размера
            const mainPrice = sizes.length > 0 && sizes[0].price ? sizes[0].price : 0;

            // Получаем полные данные карточки
            const detailedProduct = {
                ...product,
                cardData: cardData,
                imtID: cardData.imtID,
                nmID: cardData.nmID,
                subjectID: cardData.subjectID,
                subjectName: cardData.subjectName,
                vendorCode: cardData.vendorCode,
                brand: cardData.brand || product.brand || 'Не указан',
                title: cardData.title || product.name,
                description: cardData.description || '',
                characteristics: allCharacteristicsData,
                sizes: sizesInfo,
                photos: cardData.photos || [],
                video: cardData.video || '',
                tags: cardData.tags || [],
                dimensions: cardData.dimensions || {
                    length: '',
                    width: '',
                    height: '',
                    isValid: true
                },
                createdAt: cardData.createdAt,
                updatedAt: cardData.updatedAt,
                priceInfo: priceInfo,
                // Обновляем цены: если есть из API, используем их, иначе из карточки
                price: priceInfo.price || mainPrice || product.price || 0,
                discountedPrice: priceInfo.discountedPrice || priceInfo.price || mainPrice || product.price || 0,
                discount: priceInfo.discount || product.discount || 0
            };

            console.log('Детальная информация о товаре:', detailedProduct);
            return detailedProduct;

        } catch (error) {
            console.error('Ошибка загрузки деталей товара:', error);
            logApiError(error, 'Wildberries');
            throw error;
        } finally {
            setLoadingProductDetails(false);
        }
    };

    // Сохранение изменений карточки товара
    const saveProductChanges = async () => {
        if (!editedProduct) return;

        // Расширенная валидация обязательных полей
        const requiredCharacteristics = editedProduct.characteristics?.filter(char => char.required) || [];
        const emptyRequired = requiredCharacteristics.filter(char =>
            !char.value ||
            (Array.isArray(char.value) && (char.value.length === 0 || char.value.every(v => !v || v.toString().trim() === ''))) ||
            (!Array.isArray(char.value) && (!char.value || char.value.toString().trim() === ''))
        );

        // Базовая валидация обязательных полей
        const validationErrors = [];

        if (!editedProduct.vendorCode || editedProduct.vendorCode.trim() === '') {
            validationErrors.push('Артикул продавца (vendorCode) является обязательным полем');
        }

        if (!editedProduct.sizes || editedProduct.sizes.length === 0) {
            validationErrors.push('Необходимо указать хотя бы один размер');
        }

        if (!editedProduct.title || editedProduct.title.trim() === '') {
            validationErrors.push('Название товара является обязательным полем');
        }

        if (editedProduct.title && editedProduct.title.length > 60) {
            validationErrors.push('Название товара не должно превышать 60 символов');
        }

        // Проверка корректности размеров
        const invalidSizes = editedProduct.sizes?.filter(size => !size.techSize || size.techSize.trim() === '') || [];
        if (invalidSizes.length > 0) {
            validationErrors.push('Все размеры должны иметь технический размер (techSize)');
        }

        // Проверка габаритов (если указаны)
        if (editedProduct.dimensions) {
            const { length, width, height } = editedProduct.dimensions;
            if ((length && length <= 0) || (width && width <= 0) || (height && height <= 0)) {
                validationErrors.push('Габариты должны быть положительными числами в сантиметрах');
            }
        }

        if (emptyRequired.length > 0) {
            validationErrors.push(`Заполните обязательные характеристики: ${emptyRequired.map(char => char.name).join(', ')}`);
        }

        if (validationErrors.length > 0) {
            alert(`❌ Ошибки валидации:\n\n${validationErrors.map(error => `• ${error}`).join('\n')}`);
            return;
        }

        setSavingProduct(true);
        try {
            // Подготавливаем данные строго по спецификации API /content/v2/cards/update
            const cardUpdatePayload = {
                nmID: parseInt(editedProduct.nmID), // Required: ID номенклатуры (число)
                vendorCode: editedProduct.vendorCode.trim(), // Required: Артикул продавца
                brand: editedProduct.brand?.trim() || "", // Бренд
                title: editedProduct.title?.trim() || "", // Наименование товара (макс. 60 символов)
                description: editedProduct.description?.trim() || "", // Описание товара

                // Габариты в сантиметрах (обязательны для обновления)
                dimensions: {
                    length: Math.max(0, parseInt(editedProduct.dimensions?.length) || 0),
                    width: Math.max(0, parseInt(editedProduct.dimensions?.width) || 0),
                    height: Math.max(0, parseInt(editedProduct.dimensions?.height) || 0),
                    isValid: true // Флаг валидности габаритов
                },

                // Характеристики товара
                characteristics: (editedProduct.characteristics || [])
                    .filter(char => {
                        // Фильтруем только характеристики с корректными ID и значениями
                        const charIdNumber = parseInt(char.id);
                        return !isNaN(charIdNumber) && charIdNumber > 0 && char.value && (
                            Array.isArray(char.value)
                                ? char.value.length > 0 && char.value.some(v => v && v.toString().trim() !== '')
                                : char.value.toString().trim() !== ''
                        );
                    })
                    .map(char => {
                        // Преобразуем значения в правильный формат
                        let valueArray = Array.isArray(char.value) ? char.value : [char.value];
                        valueArray = valueArray
                            .filter(v => v && v.toString().trim() !== '')
                            .map(v => v.toString().trim());

                        return {
                            id: parseInt(char.id),
                            value: valueArray
                        };
                    }),

                // Размеры товара (обязательные)
                sizes: (() => {
                    const sizes = editedProduct.sizes || [];

                    // Если размеров нет, создаем дефолтный размер
                    if (sizes.length === 0) {
                        console.warn('Нет размеров, создаем дефолтный размер');
                        return [{
                            techSize: "0", // Технический размер по умолчанию
                            wbSize: "", // Размер WB может быть пустым
                            skus: editedProduct.barcode ? [editedProduct.barcode] : []
                        }];
                    }

                    // Мапим существующие размеры
                    return sizes.map(size => {
                        const sizeData = {
                            techSize: size.techSize?.trim() || "0", // Если нет техразмера, ставим "0"
                            wbSize: size.wbSize?.trim() || "", // Размер WB
                            skus: Array.isArray(size.skus) ? size.skus.filter(sku => sku && sku.trim()) : []
                        };

                        // Если нет SKU, пытаемся взять из баркода товара
                        if (sizeData.skus.length === 0 && editedProduct.barcode) {
                            sizeData.skus = [editedProduct.barcode];
                        }

                        // Добавляем chrtID только если он существует (для обновления существующих размеров)
                        if (size.chrtID && !isNaN(parseInt(size.chrtID))) {
                            sizeData.chrtID = parseInt(size.chrtID);
                        }

                        // Добавляем price если есть
                        if (size.price && !isNaN(parseInt(size.price))) {
                            sizeData.price = parseInt(size.price);
                        }

                        return sizeData;
                    });
                })()
            };

            // Тело запроса - массив карточек (максимум 3000 номенклатур за запрос)
            const requestBody = [cardUpdatePayload];

            console.log('Отправляем обновление карточки:', JSON.stringify(requestBody, null, 2));

            const response = await makeWBRequest(`${WB_API_BASE.content}/content/v2/cards/update`, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            console.log('Ответ от API обновления карточки:', response);

            // Обработка ответа согласно документации WB API
            if (response.error === true && response.errorText) {
                let errorMessage = `Ошибка WB API: ${response.errorText}`;
                if (response.additionalErrors) {
                    errorMessage += `\nДополнительные ошибки: ${JSON.stringify(response.additionalErrors)}`;
                }
                throw new Error(errorMessage);
            }

            if (response.error === false && (response.data === null || response.data === undefined)) {
                // Успешный ответ - обновление поставлено в очередь на обработку
                alert('✅ Изменения карточки успешно отправлены на обработку в Wildberries!\n\nОбработка может занять несколько минут. Проверьте результат в личном кабинете.');

                // Перезагружаем данные товара для получения актуальной информации
                try {
                    const updatedDetails = await fetchProductDetails(editedProduct);
                    setProductDetails(updatedDetails);
                    setIsEditMode(false);

                    // Обновляем товар в общем списке
                    setProducts(prevProducts => prevProducts.map(p =>
                        p.nmID === updatedDetails.nmID ? {
                            ...p,
                            name: updatedDetails.title || p.name,
                            sku: updatedDetails.vendorCode || p.sku,
                            brand: updatedDetails.brand || p.brand
                        } : p
                    ));
                } catch (reloadError) {
                    console.warn('Не удалось перезагрузить данные товара после обновления:', reloadError);
                }

            } else if (response.error) {
                // Обработка других ошибок
                throw new Error(response.errorText || 'Неизвестная ошибка при обновлении карточки');
            }

        } catch (error) {
            console.error('Ошибка сохранения изменений карточки:', error);
            logApiError(error, 'Wildberries (обновление карточки)');

            let userMessage = '❌ Ошибка сохранения изменений:\n\n';

            if (error.message.includes('400')) {
                userMessage += 'Некорректные данные в запросе. Проверьте:\n• Все обязательные поля заполнены\n• Артикул продавца указан корректно\n• Размеры и габариты указаны правильно\n• Характеристики заполнены в соответствии с требованиями категории';
            } else if (error.message.includes('401')) {
                userMessage += 'Ошибка авторизации. Проверьте правильность API ключа в настройках.';
            } else if (error.message.includes('403')) {
                userMessage += 'Недостаточно прав доступа. Убедитесь, что API ключ имеет права на категорию "Контент".';
            } else if (error.message.includes('429')) {
                userMessage += 'Превышен лимит запросов API (100 запросов/минуту). Подождите минуту и попробуйте снова.';
            } else {
                userMessage += error.message;
            }

            userMessage += '\n\nПодробная информация об ошибке в консоли разработчика (F12).';
            alert(userMessage);

        } finally {
            setSavingProduct(false);
        }
    };

    // Выбор/снятие выбора товара
    const toggleProductSelection = (productId) => {
        setSelectedProductIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(productId)) {
                newSet.delete(productId);
            } else {
                newSet.add(productId);
            }
            return newSet;
        });
    };

// Выбрать все товары на странице
    const selectAllProducts = () => {
        const allIds = new Set(products.map(p => p.nmID));
        setSelectedProductIds(allIds);
    };

// Снять выделение со всех товаров
    const clearSelection = () => {
        setSelectedProductIds(new Set());
    };

// Открыть модальное окно массового редактирования
    const openBulkEditModal = async () => {
        if (selectedProductIds.size === 0) return;

        // Определяем общие категории среди выбранных товаров
        const selectedProducts = products.filter(p => selectedProductIds.has(p.nmID));
        const categories = [...new Set(selectedProducts.map(p => p.category))];

        if (categories.length === 1) {
            // Все товары одной категории - можем загрузить характеристики
            setSelectedCategoryForBulk(categories[0]);
            // Здесь можно загрузить характеристики категории
        } else {
            setSelectedCategoryForBulk(null);
        }

        setShowBulkEditModal(true);
    };

// Применить массовые изменения
    const applyBulkChanges = async () => {
        setBulkSaving(true);
        try {
            const selectedProducts = products.filter(p => selectedProductIds.has(p.nmID));
            const updatePromises = [];

            for (const product of selectedProducts) {
                const updatePayload = {
                    nmID: product.nmID,
                    vendorCode: product.sku
                };

                // Применяем только включенные изменения
                if (bulkEditData.brand.enabled) {
                    updatePayload.brand = bulkEditData.brand.value;
                }

                if (bulkEditData.dimensions.enabled) {
                    updatePayload.dimensions = {
                        length: parseInt(bulkEditData.dimensions.value.length) || 0,
                        width: parseInt(bulkEditData.dimensions.value.width) || 0,
                        height: parseInt(bulkEditData.dimensions.value.height) || 0,
                        isValid: true
                    };
                }

                // Добавляем характеристики если включены
                if (bulkEditData.characteristics.length > 0) {
                    updatePayload.characteristics = bulkEditData.characteristics
                        .filter(char => char.enabled && char.value)
                        .map(char => ({
                            id: parseInt(char.id),
                            value: [char.value]
                        }));
                }

                updatePromises.push(updatePayload);
            }

            // Отправляем батчами по 100 товаров (лимит API)
            const batchSize = 100;
            let successCount = 0;

            for (let i = 0; i < updatePromises.length; i += batchSize) {
                const batch = updatePromises.slice(i, i + batchSize);

                try {
                    await makeWBRequest(`${WB_API_BASE.content}/content/v2/cards/update`, {
                        method: 'POST',
                        body: JSON.stringify(batch)
                    });
                    successCount += batch.length;

                    // Задержка между батчами
                    if (i + batchSize < updatePromises.length) {
                        await delay(1000);
                    }
                } catch (error) {
                    console.error('Ошибка обновления батча:', error);
                    logApiError(error, 'Wildberries (массовое обновление)');
                }
            }

            alert(`✅ Успешно обновлено ${successCount} из ${selectedProductIds.size} товаров`);

            // Перезагружаем данные
            await fetchMarketplaceData(selectedMarketplace);
            setShowBulkEditModal(false);
            setBulkEditData({
                brand: { enabled: false, value: '' },
                price: { enabled: false, value: 0 },
                dimensions: { enabled: false, value: { length: '', width: '', height: '' } },
                characteristics: []
            });
            clearSelection();

        } catch (error) {
            console.error('Ошибка массового обновления:', error);
            alert('❌ Произошла ошибка при массовом обновлении товаров');
        } finally {
            setBulkSaving(false);
        }
    };


    // Открыть карточку товара
    const openProductCard = async (product) => {
        setSelectedProduct(product);
        setShowProductModal(true);
        setProductDetails(null);
        setIsEditMode(false);
        setEditedProduct(null);

        try {
            const details = await fetchProductDetails(product);
            setProductDetails(details);
        } catch (error) {
            console.error('Не удалось загрузить детали товара:', error);
        }
    };

    // Закрыть карточку товара
    const closeProductCard = () => {
        setShowProductModal(false);
        setSelectedProduct(null);
        setProductDetails(null);
        setIsEditMode(false);
        setEditedProduct(null);
        setCategoryCharacteristics([]);
    };

    // Начать редактирование товара
    const startEditProduct = () => {
        if (productDetails) {
            // Создаем глубокую копию и преобразуем характеристики в правильный формат
            const editableProduct = JSON.parse(JSON.stringify(productDetails));

            // Убеждаемся, что все характеристики имеют значения в виде массивов
            if (editableProduct.characteristics) {
                editableProduct.characteristics = editableProduct.characteristics.map(char => ({
                    ...char,
                    value: Array.isArray(char.value) ? char.value : (char.value ? [char.value] : []),
                    popular: char.popular || false
                }));
            }

            setEditedProduct(editableProduct);
            setIsEditMode(true);
        }
    };

    // Отменить редактирование
    const cancelEditProduct = () => {
        setIsEditMode(false);
        setEditedProduct(null);
    };

    // Обновить характеристику в режиме редактирования
    const updateCharacteristic = (charId, value) => {
        if (!editedProduct) return;

        setEditedProduct(prev => ({
            ...prev,
            characteristics: prev.characteristics.map(char =>
                char.id === charId ? {
                    ...char,
                    value: value ? [value] : [] // Всегда сохраняем как массив
                } : char
            )
        }));
    };

    // Обновить размер в режиме редактирования
    const updateSize = (index, field, value) => {
        if (!editedProduct) return;

        setEditedProduct(prev => ({
            ...prev,
            sizes: prev.sizes.map((size, i) =>
                i === index ? { ...size, [field]: value } : size
            )
        }));
    };

    const fetchWBProductsWithPagination = async (cursor = null, searchText = '', isLoadMore = false, customFilters = null) => {
        try {
            // Используем переданные фильтры или дефолтные значения
            const activeFilters = customFilters || (typeof searchFilters !== 'undefined' ? searchFilters : {
                withPhoto: -1,
                textSearch: '',
                showOnlyWithStock: false,
                showOnlyActive: false,
                sortBy: 'updatedAt',
                sortOrder: 'desc'
            });

            // Строим фильтр для поиска согласно API документации
            const filter = {
                withPhoto: activeFilters.withPhoto // -1: все, 0: без фото, 1: с фото
            };

            // Добавляем текстовый поиск
            const searchValue = (searchText || activeFilters.textSearch || '').trim();
            if (searchValue) {
                filter.textSearch = searchValue;
            }

            // Определяем желаемый размер страницы
            const desiredPageSize = customPageSize || pageSize || 50;

            // WB API лимит: максимум 100 карточек за запрос
            const maxCardsPerRequest = 100;

            // Рассчитываем сколько запросов нужно сделать
            const requestsNeeded = Math.ceil(Math.min(desiredPageSize, 1000) / maxCardsPerRequest);

            console.log(`Планируется ${requestsNeeded} запросов для получения ${desiredPageSize} товаров (макс. ${maxCardsPerRequest} за запрос)`);

            // Показываем прогресс для больших запросов
            if (desiredPageSize > 100) {
                setLoadingProgress({ current: 0, total: requestsNeeded });
            }

            let allCards = [];
            let currentCursor = cursor;
            let finalCursor = null;

            // Делаем серию запросов для получения нужного количества товаров
            for (let requestIndex = 0; requestIndex < requestsNeeded; requestIndex++) {
                // Обновляем прогресс
                if (desiredPageSize > 100) {
                    setLoadingProgress({ current: requestIndex + 1, total: requestsNeeded });
                }
                // Определяем лимит для текущего запроса
                const remainingCards = desiredPageSize - allCards.length;
                const currentLimit = Math.min(maxCardsPerRequest, remainingCards);

                if (currentLimit <= 0) break;

                const requestCursor = {
                    limit: currentLimit,
                    ...(currentCursor || {})
                };

                const requestBody = {
                    settings: {
                        cursor: requestCursor,
                        filter
                    }
                };

                console.log(`Запрос ${requestIndex + 1}/${requestsNeeded}:`, JSON.stringify(requestBody, null, 2));

                const cardsResponse = await makeWBRequest(`${WB_API_BASE.content}/content/v2/get/cards/list`, {
                    method: 'POST',
                    body: JSON.stringify(requestBody)
                });

                console.log(`Ответ ${requestIndex + 1}/${requestsNeeded}:`, cardsResponse);

                if (!cardsResponse?.cards || cardsResponse.cards.length === 0) {
                    console.log(`Запрос ${requestIndex + 1}: карточки не найдены, завершаем`);
                    break;
                }

                // Добавляем полученные карточки к общему массиву
                allCards = [...allCards, ...cardsResponse.cards];

                // Сохраняем последний cursor для следующего запроса
                finalCursor = cardsResponse.cursor;

                // Обновляем cursor для следующего запроса
                if (cardsResponse.cursor && cardsResponse.cards.length === currentLimit) {
                    currentCursor = {
                        limit: maxCardsPerRequest,
                        updatedAt: cardsResponse.cursor.updatedAt,
                        nmID: cardsResponse.cursor.nmID
                    };
                } else {
                    // Если получили меньше карточек чем запрашивали - больше нет данных
                    console.log(`Запрос ${requestIndex + 1}: получено ${cardsResponse.cards.length} из ${currentLimit}, данные закончились`);
                    break;
                }

                // Задержка между запросами для соблюдения лимитов API (100 req/min)
                if (requestIndex < requestsNeeded - 1) {
                    // Увеличиваем задержку для больших запросов
                    const delayMs = desiredPageSize > 500 ? 1000 : 700;
                    await delay(delayMs);
                }
            }

            // Сбрасываем прогресс
            setLoadingProgress({ current: 0, total: 0 });

            console.log(`Получено ${allCards.length} карточек за ${requestsNeeded} запросов`);

            if (allCards.length === 0) {
                return {
                    products: [],
                    cursor: finalCursor || null,
                    hasMore: false,
                    total: finalCursor?.total || 0
                };
            }

            // Задержка перед получением дополнительных данных
            await delay(200);

            // Получаем склады (с кэшированием)
            let warehousesResponse = [];
            if (!window.wbWarehousesCache || Date.now() - (window.wbWarehousesCacheTime || 0) > 300000) { // Кэш на 5 минут
                try {
                    warehousesResponse = await makeWBRequest(`${WB_API_BASE.marketplace}/api/v3/warehouses`);
                    window.wbWarehousesCache = warehousesResponse;
                    window.wbWarehousesCacheTime = Date.now();
                    console.log('Склады обновлены в кэше:', warehousesResponse);
                } catch (warehouseError) {
                    console.warn('Ошибка получения складов:', warehouseError);
                    warehousesResponse = window.wbWarehousesCache || [];
                }
            } else {
                warehousesResponse = window.wbWarehousesCache;
                console.log('Используем кэшированные склады');
            }

            // Собираем данные для массовых запросов
            const allSkus = [];
            const allNmIds = [];
            const skuToCardMap = new Map();

            allCards.forEach(card => {
                allNmIds.push(card.nmID);

                if (card.sizes && card.sizes.length > 0) {
                    const cardSkus = card.sizes
                        .flatMap(size => size.skus || [])
                        .filter(sku => sku && sku.trim().length > 0);

                    cardSkus.forEach(sku => {
                        allSkus.push(sku);
                        skuToCardMap.set(sku, card.nmID);
                    });
                }
            });

            console.log(`Подготовлено для массовых запросов: ${allSkus.length} SKU, ${allNmIds.length} nmID`);

            // Получение остатков массовыми запросами (максимум 1000 SKU за запрос)
            const stocksMap = new Map();
            if (warehousesResponse.length > 0 && allSkus.length > 0) {
                const warehouse = warehousesResponse[0];

                // Разбиваем SKU на батчи по 1000 (лимит API)
                const skuBatches = [];
                for (let i = 0; i < allSkus.length; i += 1000) {
                    skuBatches.push(allSkus.slice(i, i + 1000));
                }

                for (const [batchIndex, skuBatch] of skuBatches.entries()) {
                    try {
                        const stocksResponse = await makeWBRequest(`${WB_API_BASE.marketplace}/api/v3/stocks/${warehouse.id}`, {
                            method: 'POST',
                            body: JSON.stringify({ skus: skuBatch })
                        });

                        if (stocksResponse?.stocks) {
                            stocksResponse.stocks.forEach(stock => {
                                const cardId = skuToCardMap.get(stock.sku);
                                if (cardId) {
                                    const currentStock = stocksMap.get(cardId) || 0;
                                    stocksMap.set(cardId, currentStock + (stock.amount || 0));
                                }
                            });
                        }

                        // Задержка между батчами остатков (300 req/min)
                        if (batchIndex < skuBatches.length - 1) {
                            await delay(250);
                        }
                    } catch (stockError) {
                        console.warn(`Ошибка получения остатков для батча ${batchIndex + 1}:`, stockError);
                    }
                }
            }

            // Получение цен массовым запросом
            await delay(200);
            let pricesMap = {};
            try {
                pricesMap = await fetchWBPrices(allNmIds);
            } catch (priceError) {
                console.warn('Ошибка получения цен, используем базовые цены из карточек:', priceError);
            }

            // Формирование итогового массива товаров
            let processedProducts = allCards.map(card => {
                const totalStock = stocksMap.get(card.nmID) || 0;
                const priceInfo = pricesMap[card.nmID] || {};

                // Базовая цена из карточки
                const basePrice = card.sizes?.[0]?.price || 0;

                // Получение URL первой фотографии
                const firstPhoto = card.photos?.[0];
                const photoUrl = firstPhoto ? (
                    typeof firstPhoto === 'string' ? firstPhoto :
                        firstPhoto.big || firstPhoto.c516x688 || firstPhoto.tm || firstPhoto.square
                ) : null;

                return {
                    id: card.nmID,
                    name: card.title || card.subjectName || 'Товар без названия',
                    sku: card.vendorCode || `WB-${card.nmID}`,
                    price: priceInfo.price || basePrice,
                    discountedPrice: priceInfo.discountedPrice || priceInfo.price || basePrice,
                    discount: priceInfo.discount || 0,
                    stock: totalStock,
                    marketplace: 'Wildberries',
                    status: totalStock > 0 ? 'active' : (totalStock === 0 ? 'out_of_stock' : 'unknown'),
                    barcode: card.sizes?.[0]?.skus?.[0] || '',
                    brand: card.brand || 'Не указан',
                    category: card.subjectName || 'Не указана',
                    nmID: card.nmID,
                    imtID: card.imtID,
                    createdAt: card.createdAt,
                    updatedAt: card.updatedAt,
                    photo: photoUrl,
                    needKiz: card.needKiz || false, // Новое поле для маркировки "Честный знак"
                    hasPhoto: !!(card.photos && card.photos.length > 0)
                };
            });

            // Применяем дополнительные фильтры после получения данных
            if (activeFilters.showOnlyWithStock) {
                processedProducts = processedProducts.filter(p => p.stock > 0);
            }

            if (activeFilters.showOnlyActive) {
                processedProducts = processedProducts.filter(p => p.status === 'active');
            }

            // Проверяем наличие дополнительных данных для загрузки
            // Есть еще данные если последний запрос вернул полный лимит карточек
            const lastRequestWasFull = allCards.length > 0 &&
                (allCards.length % maxCardsPerRequest === 0) &&
                finalCursor?.total > (finalCursor?.updatedAt || 0);

            const hasMore = lastRequestWasFull && allCards.length < (finalCursor?.total || 0);

            const resultData = {
                products: processedProducts,
                cursor: finalCursor,
                hasMore: hasMore,
                total: finalCursor?.total || processedProducts.length
            };

            console.log(`Обработано товаров: ${processedProducts.length}, всего доступно: ${resultData.total}, есть еще: ${hasMore}`);

            return resultData;

        } catch (error) {
            console.error('Ошибка загрузки товаров WB:', error);
            throw error;
        }
    };

    // Поиск товаров с расширенными фильтрами
    const searchProducts = async (query = '', customFilters = null) => {
        if (!apiKeys.wildberries) {
            alert('Настройте API ключ Wildberries в разделе "Настройки"');
            return;
        }

        setLoading(true);
        setProducts([]);
        setProductsCursor(null);
        setHasMoreProducts(true);

        try {
            // Обновляем фильтры поиска
            const updatedFilters = {
                ...searchFilters,
                textSearch: query.trim(),
                ...(customFilters || {})
            };

            setSearchFilters(updatedFilters);

            // Передаем текущий pageSize в функцию загрузки
            const result = await fetchWBProductsWithPagination(null, query, false, updatedFilters, pageSize);
            setProducts(result.products);
            setProductsCursor(result.cursor);
            setHasMoreProducts(result.hasMore);
            setTotalProducts(result.total);
            setLastSync(new Date().toLocaleString('ru-RU'));

            console.log(`Поиск завершен: найдено ${result.products.length} товаров из ${result.total}`);

            if (result.products.length === 0 && query.trim()) {
                console.log('Товары не найдены по запросу:', query);
            }

        } catch (error) {
            logApiError(error, 'Wildberries (поиск товаров)');
            handleWBError(error);
        } finally {
            setLoading(false);
        }
    };

    // Применение фильтров
    const applyFilters = async () => {
        await searchProducts(searchQuery, searchFilters);
    };

    // Сброс фильтров
    const resetFilters = () => {
        const defaultFilters = {
            withPhoto: -1,
            textSearch: '',
            showOnlyWithStock: false,
            showOnlyActive: false,
            sortBy: 'updatedAt',
            sortOrder: 'desc'
        };
        setSearchFilters(defaultFilters);
        setSearchQuery('');
    };

    // Обработка ошибок WB API
    const handleWBError = (error) => {
        if (error.message.includes('400')) {
            alert(`❌ Ошибка запроса к Wildberries (400):\n\nВозможные причины:\n• Неправильный формат данных в запросе\n• Отсутствуют обязательные поля\n• Неверная структура JSON\n• API ключ не имеет нужных прав\n\nПроверьте:\n• Настройки токена в ЛК (категории "Контент" и "Маркетплейс")\n• Срок действия токена (180 дней)\n• Правильность ввода API ключа\n\nОткройте консоль разработчика (F12) для подробной информации об ошибке.`);
        } else if (error.message.includes('401')) {
            alert('❌ Ошибка авторизации Wildberries:\n• Проверьте правильность API ключа\n• Убедитесь, что ключ не истек (действует 180 дней)\n• Проверьте права доступа к категориям API');
        } else if (error.message.includes('403')) {
            alert('❌ Доступ запрещен Wildberries:\n• API ключ должен иметь доступ к категориям "Контент" и "Маркетплейс"\n• Проверьте настройки токена в ЛК');
        } else if (error.message.includes('429')) {
            alert('❌ Превышен лимит запросов Wildberries:\n• Подождите 1-2 минуты перед повторной попыткой\n• Лимит: 100 запросов/мин для Контент, 300/мин для Маркетплейс\n• Используйте поиск для конкретных товаров');
        } else if (error.message.includes('404')) {
            alert('❌ Ресурс не найден Wildberries:\n• Возможно, нет товаров в каталоге\n• Или нет складов для получения остатков\n• Создайте товары и склады в ЛК');
        } else {
            alert(`❌ Ошибка загрузки данных Wildberries:\n${error.message}\n\nПроверьте:\n• Подключение к интернету\n• Правильность API ключа\n• Настройки токена в ЛК\n\nОткройте консоль разработчика (F12) для подробной информации.`);
        }
    };

    const fetchWBOrders = async () => {
        try {
            // Получаем все заказы без фильтров
            const params = new URLSearchParams({
                limit: '1000', // WB ожидает строки для query параметров
                next: '0',
                dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Последние 30 дней
                dateTo: new Date().toISOString().split('T')[0]
            });

            // Формируем URL с query параметрами
            const url = `${WB_API_BASE.marketplace}/api/v3/orders?${params.toString()}`;

            console.log('Запрос заказов WB (GET):', url); // Логируем URL

            const ordersResponse = await makeWBRequest(url, {
                method: 'GET', // ИЗМЕНЕНО НА GET
                // body: JSON.stringify(...) // Убираем body для GET запроса
            });

            if (!ordersResponse || !ordersResponse.orders || ordersResponse.orders.length === 0) {
                console.log('Заказов не найдено');
                return [];
            }

            const orders = ordersResponse.orders.map(order => ({
                id: order.id,
                date: new Date(order.createdAt).toLocaleDateString('ru-RU'),
                customer: order.user?.fio || order.user?.phone || `Заказ ${order.id}`,
                total: order.convertedPrice || order.price || 0,
                status: getOrderStatus(order.status || order.wbStatus),
                marketplace: 'Wildberries',
                items: order.skus?.length || 1,
                deliveryDate: order.deliveryDate ?
                    new Date(order.deliveryDate).toLocaleDateString('ru-RU') :
                    'Не указано',
                phone: order.user?.phone || '',
                article: order.article || order.supplierArticle || '',
                barcode: order.skus?.[0] || ''
            }));

            return orders;
        } catch (error) {
            console.error('Ошибка загрузки заказов WB:', error);

            // Если нет новых заказов или доступа - не показываем как ошибку
            if (error.message.includes('404') || error.message.includes('не найдено') ||
                error.message.includes('IncorrectParameter')) {
                console.log('Новых заказов не найдено или неверный формат запроса');
                return [];
            }

            throw error;
        }
    };

    const getOrderStatus = (wbStatus) => {
        const statusMap = {
            'waiting': 'pending',
            'sorted': 'processing',
            'sold': 'delivered',
            'canceled': 'cancelled',
            'canceled_by_client': 'cancelled',
            'declined_by_client': 'cancelled'
        };

        return statusMap[wbStatus] || 'pending';
    };

    // Обновление цен товаров WB
    const updateWBPrices = async (priceUpdates) => {
        try {
            // API для обновления цен
            const response = await makeWBRequest(`${WB_API_BASE.prices}/api/v2/prices`, {
                method: 'POST',
                body: JSON.stringify(priceUpdates)
            });

            return response;
        } catch (error) {
            console.error('Ошибка обновления цен WB:', error);
            throw error;
        }
    };

    // Получение текущих цен товаров
    const syncProductPrices = async () => {
        if (!apiKeys.wildberries) {
            alert('Не установлен API ключ Wildberries');
            return;
        }

        setLoading(true);
        try {
            const nmIds = products
                .filter(p => p.marketplace === 'Wildberries')
                .map(p => p.nmID);

            if (nmIds.length === 0) {
                alert('Нет товаров Wildberries для синхронизации цен');
                return;
            }

            console.log(`Синхронизируем цены для ${nmIds.length} товаров`);

            const pricesMap = await fetchWBPrices(nmIds);
            let updatedCount = 0;

            // Обновляем цены в состоянии товаров
            setProducts(prevProducts =>
                prevProducts.map(product => {
                    if (product.marketplace === 'Wildberries' && pricesMap[product.nmID]) {
                        const priceInfo = pricesMap[product.nmID];
                        updatedCount++;
                        return {
                            ...product,
                            price: priceInfo.price || product.price,
                            discountedPrice: priceInfo.discountedPrice,
                            discount: priceInfo.discount || 0
                        };
                    }
                    return product;
                })
            );

            if (updatedCount > 0) {
                alert(`✅ Обновлены цены для ${updatedCount} товаров из ${nmIds.length}`);
                setLastSync(new Date().toLocaleString('ru-RU'));
            } else {
                alert(`ℹ️ Синхронизация цен завершена.\n\nЦены получены из API Wildberries, но данные могут быть не актуальными для некоторых товаров.\nПроверьте правильность цен в личном кабинете.`);
            }

        } catch (error) {
            console.error('Ошибка синхронизации цен:', error);
            logApiError(error, 'Wildberries');

            if (error.message.includes('404')) {
                alert('❌ Ошибка: Не найдены данные о ценах. Проверьте права доступа к категории "Цены и скидки"');
            } else if (error.message.includes('403')) {
                alert('❌ Ошибка доступа. Убедитесь, что API ключ имеет права на категорию "Цены и скидки"');
            } else {
                alert(`❌ Ошибка синхронизации цен: ${error.message}\n\nПроверьте подключение к интернету и права доступа к API.`);
            }
        } finally {
            setLoading(false);
        }
    };

// Очистка данных товаров и фильтров
    const clearProductsData = () => {
        setProducts([]);
        setProductsCursor(null);
        setHasMoreProducts(true);
        setTotalProducts(0);
        setSearchQuery('');
        if (typeof resetFilters !== 'undefined') {
            resetFilters();
        }
    };

    const updateWBStock = async (sku, warehouseId, quantity) => {
        try {
            const response = await makeWBRequest(`${WB_API_BASE.marketplace}/api/v3/stocks/${warehouseId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    stocks: [{
                        sku: sku,
                        amount: quantity
                    }]
                })
            });

            return response;
        } catch (error) {
            console.error('Ошибка обновления остатков WB:', error);
            throw error;
        }
    };

    const syncProductStocks = async () => {
        if (!apiKeys.wildberries) {
            alert('Не установлен API ключ Wildberries');
            return;
        }

        setLoading(true);
        try {
            // Сначала получаем список складов
            const warehousesResponse = await makeWBRequest(`${WB_API_BASE.marketplace}/api/v3/warehouses`);

            if (!warehousesResponse || warehousesResponse.length === 0) {
                alert('❌ Не найдено складов. Создайте склад в личном кабинете Wildberries.');
                return;
            }

            const warehouse = warehousesResponse[0]; // Используем первый склад
            let updatedCount = 0;

            for (const product of products.filter(p => p.marketplace === 'Wildberries')) {
                try {
                    // В реальном приложении здесь получаем актуальные остатки из вашей системы
                    const newStock = product.stock;
                    await updateWBStock(product.barcode, warehouse.id, newStock);
                    updatedCount++;
                } catch (error) {
                    console.error(`Ошибка обновления остатков для ${product.sku}:`, error);
                }
            }

            alert(`✅ Обновлено остатков: ${updatedCount} из ${products.filter(p => p.marketplace === 'Wildberries').length}\nСклад: ${warehouse.name}`);

            // Перезагружаем данные
            await fetchMarketplaceData(selectedMarketplace);
        } catch (error) {
            console.error('Ошибка синхронизации остатков:', error);

            if (error.message.includes('404')) {
                alert('❌ Ошибка: Не найдены склады. Создайте склад продавца в ЛК Wildberries → Продажи → Склады');
            } else if (error.message.includes('403')) {
                alert('❌ Ошибка доступа. Убедитесь, что API ключ имеет права на категорию "Маркетплейс"');
            } else {
                alert(`❌ Ошибка синхронизации остатков: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    // Загрузка данных с маркетплейсов
    const fetchMarketplaceData = async (marketplace) => {
        setLoading(true);
        try {
            let products = [];
            let orders = [];

            if (marketplace === 'wildberries' || marketplace === 'all') {
                if (apiKeys.wildberries) {
                    try {
                        // Сбрасываем состояние при первой загрузке
                        if (!products.length) {
                            const result = await fetchWBProductsWithPagination(null, '', false, null, pageSize);
                            products = [...products, ...result.products];
                            setProductsCursor(result.cursor);
                            setHasMoreProducts(result.hasMore);
                            setTotalProducts(result.cursor?.total || result.products.length);
                        }

                        const wbOrders = await fetchWBOrders();
                        orders = [...orders, ...wbOrders];
                        setLastSync(new Date().toLocaleString('ru-RU'));
                    } catch (error) {
                        logApiError(error, 'Wildberries');
                        handleWBError(error);
                    }
                } else {
                    console.log('API ключ Wildberries не настроен');
                }
            }

            // Заглушки для других маркетплейсов (пока не интегрированы)
            if (marketplace === 'ozon' || marketplace === 'all') {
                if (apiKeys.ozon.apiKey) {
                    // TODO: Реализовать интеграцию с Ozon API
                    products.push({
                        id: 2, name: 'Наушники Apple AirPods', sku: 'AP-PRO-2',
                        price: 22990, stock: 87, marketplace: 'Ozon',
                        status: 'active', barcode: '888462384291', brand: 'Apple'
                    });
                    orders.push({
                        id: 1002, date: '2024-03-15', customer: 'Мария Сидорова',
                        total: 22990, status: 'processing', marketplace: 'Ozon',
                        items: 1, deliveryDate: '2024-03-19'
                    });
                }
            }

            if (marketplace === 'yandex' || marketplace === 'all') {
                if (apiKeys.yandex) {
                    // TODO: Реализовать интеграцию с Яндекс.Маркет API
                    products.push({
                        id: 3, name: 'Ноутбук ASUS VivoBook', sku: 'AS-VB15',
                        price: 54990, stock: 34, marketplace: 'Яндекс.Маркет',
                        status: 'active', barcode: '4718017797047', brand: 'ASUS'
                    });
                    orders.push({
                        id: 1003, date: '2024-03-14', customer: 'Алексей Иванов',
                        total: 54990, status: 'shipped', marketplace: 'Яндекс.Маркет',
                        items: 1, deliveryDate: '2024-03-16'
                    });
                }
            }

            setProducts(products);
            setOrders(orders);
        } catch (error) {
            console.error('Ошибка при загрузке данных:', error);
            alert('Общая ошибка при загрузке данных. Проверьте подключение к интернету.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMarketplaceData(selectedMarketplace);
    }, [selectedMarketplace]);
    // Перезагружаем данные при изменении размера страницы
    useEffect(() => {
        // Пропускаем первый рендер
        if (products.length > 0 || loading) {
            return;
        }
    }, [pageSize]);

    const salesData = [
        { name: 'Пн', sales: 12, revenue: 284000 },
        { name: 'Вт', sales: 19, revenue: 421000 },
        { name: 'Ср', sales: 15, revenue: 337000 },
        { name: 'Чт', sales: 25, revenue: 567000 },
        { name: 'Пт', sales: 31, revenue: 698000 },
        { name: 'Сб', sales: 28, revenue: 624000 },
        { name: 'Вс', sales: 22, revenue: 489000 },
    ];

    const marketplaceData = [
        { name: 'Wildberries', value: 45, color: '#8B5CF6' },
        { name: 'Ozon', value: 30, color: '#3B82F6' },
        { name: 'Яндекс.Маркет', value: 25, color: '#F59E0B' },
    ];

    const categoryData = [
        { name: 'Электроника', sales: 67 },
        { name: 'Одежда', sales: 45 },
        { name: 'Обувь', sales: 38 },
        { name: 'Аксессуары', sales: 29 },
        { name: 'Спорт', sales: 21 },
    ];

    const metrics = {
        totalRevenue: 3420000,
        totalOrders: 152,
        averageCheck: 22500,
        conversionRate: 3.2,
        returnsRate: 2.1,
        stockValue: 1847000,
    };

    const testApiConnection = async (marketplace) => {
        setLoading(true);
        try {
            if (marketplace === 'Wildberries') {
                if (!apiKeys.wildberries) {
                    throw new Error('API ключ не установлен');
                }

                // Тестируем подключение к API Wildberries
                const response = await fetch(`${WB_API_BASE.content}/ping`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKeys.wildberries}`
                    }
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Неверный API ключ или доступ запрещен');
                    } else if (response.status === 429) {
                        throw new Error('Превышен лимит запросов');
                    } else {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                }

                const result = await response.json();
                if (result.Status === 'OK') {
                    // Очищаем кэш при успешном тестировании
                    if (window.wbWarehousesCache) {
                        delete window.wbWarehousesCache;
                    }

                    alert(`✅ Соединение с ${marketplace} успешно установлено!\n\nВремя сервера: ${result.TS}\n\nТеперь вы можете загружать товары и заказы.`);
                } else {
                    throw new Error('Неожиданный ответ от сервера');
                }
            } else if (marketplace === 'Ozon') {
                if (!apiKeys.ozon.clientId || !apiKeys.ozon.apiKey) {
                    throw new Error('Client ID или API ключ не установлены');
                }

                // TODO: Реализовать тестирование Ozon API
                alert(`⚠️ Тестирование ${marketplace} API пока не реализовано. Будет добавлено в следующих версиях.`);
            } else if (marketplace === 'Яндекс.Маркет') {
                if (!apiKeys.yandex) {
                    throw new Error('OAuth токен не установлен');
                }

                // TODO: Реализовать тестирование Яндекс.Маркет API
                alert(`⚠️ Тестирование ${marketplace} API пока не реализовано. Будет добавлено в следующих версиях.`);
            }
        } catch (error) {
            console.error('Ошибка тестирования API:', error);
            alert(`❌ Ошибка подключения к ${marketplace}:\n${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const saveApiKeys = () => {
        // Очищаем кэш при смене API ключей
        if (window.wbWarehousesCache) {
            delete window.wbWarehousesCache;
            console.log('Кэш складов очищен при смене API ключей');
        }

        // В реальном приложении ключи должны храниться безопасно на сервере
        localStorage.setItem('marketplaceApiKeys', JSON.stringify(apiKeys));
        alert('✅ API ключи успешно сохранены!\n\nСледующая загрузка товаров будет использовать новые настройки.');
    };

    // Загрузка сохраненных API ключей при инициализации
    useEffect(() => {
        const savedKeys = localStorage.getItem('marketplaceApiKeys');
        if (savedKeys) {
            setApiKeys(JSON.parse(savedKeys));
        }
    }, []);

    // Модальное окно карточки товара
    const renderProductModal = () => {
        if (!showProductModal || !selectedProduct) return null;

        const displayProduct = isEditMode ? editedProduct : productDetails;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                    {/* Заголовок модального окна */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={closeProductCard}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 truncate max-w-md">
                                    {displayProduct?.title || selectedProduct.name}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Артикул: {displayProduct?.vendorCode || selectedProduct.sku} • WB: {selectedProduct.nmID}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isEditMode && productDetails && (
                                <button
                                    onClick={startEditProduct}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                    title="Редактировать товар"
                                >
                                    <Edit3 size={18} />
                                </button>
                            )}
                            <a
                                href={`https://www.wildberries.ru/catalog/${selectedProduct.nmID}/detail.aspx`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="Открыть на Wildberries"
                            >
                                <ExternalLink size={18} />
                            </a>
                            <button
                                onClick={closeProductCard}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Содержимое модального окна */}
                    <div className="p-6">
                        {loadingProductDetails ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader className="animate-spin text-blue-600" size={32} />
                                <span className="ml-3 text-gray-600">Загружаем детали товара...</span>
                            </div>
                        ) : displayProduct ? (
                            <div className="space-y-6">
                                {/* Кнопки действий в режиме редактирования */}
                                {isEditMode && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Edit3 className="text-yellow-600" size={20} />
                                                <span className="text-yellow-800 font-medium">Режим редактирования</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={cancelEditProduct}
                                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                                                >
                                                    Отмена
                                                </button>
                                                <button
                                                    onClick={saveProductChanges}
                                                    disabled={savingProduct}
                                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {savingProduct ? (
                                                        <>
                                                            <Loader className="animate-spin" size={16} />
                                                            Сохранение...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save size={16} />
                                                            Сохранить изменения
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Основная информация */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Левая колонка - изображения */}
                                    <div className="space-y-4">
                                        {displayProduct.photos && displayProduct.photos.length > 0 ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                {displayProduct.photos.slice(0, 4).map((photo, index) => {
                                                    const photoUrl = typeof photo === 'string'
                                                        ? photo.startsWith('http')
                                                            ? photo
                                                            : `${photo}`
                                                        : (photo.big ? `${photo.big}` :
                                                            photo.tm ? `${photo.tm}` :
                                                                '');

                                                    return (
                                                        <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                                                            <img
                                                                src={photoUrl}
                                                                alt={`Фото ${index + 1}`}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                    e.target.nextSibling.style.display = 'flex';
                                                                }}
                                                            />
                                                            <div className="w-full h-full bg-gray-200 flex items-center justify-center" style={{display: 'none'}}>
                                                                <Package className="text-gray-400" size={32} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                                                <Package className="text-gray-400" size={48} />
                                                <span className="ml-2 text-gray-500">Фото недоступно</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Правая колонка - основная информация */}
                                    <div className="space-y-4">
                                        {/* Цена */}
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-blue-700">Цена</span>
                                                {(displayProduct.discount > 0 || displayProduct.priceInfo?.discount > 0) && (
                                                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                                                        -{displayProduct.discount || displayProduct.priceInfo?.discount}%
                                                    </span>
                                                )}
                                            </div>
                                            {displayProduct.discountedPrice && displayProduct.discountedPrice !== displayProduct.price && displayProduct.discountedPrice > 0 ? (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl font-bold text-green-600">
                                                        ₽{displayProduct.discountedPrice.toLocaleString()}
                                                    </span>
                                                    <span className="text-lg text-gray-500 line-through">
                                                        ₽{displayProduct.price.toLocaleString()}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-2xl font-bold text-blue-800">
                                                    ₽{displayProduct.price?.toLocaleString() || '0'}
                                                </span>
                                            )}
                                            {displayProduct.sizes && displayProduct.sizes.length > 0 && displayProduct.sizes[0].price > 0 && (
                                                <div className="text-xs text-gray-500 mt-2">
                                                    Цена из карточки: ₽{displayProduct.sizes[0].price.toLocaleString()}
                                                </div>
                                            )}
                                        </div>

                                        {/* Остатки */}
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                            <span className="text-sm font-medium text-gray-700 block mb-2">Остаток на складе</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-2xl font-bold ${
                                                    displayProduct.stock > 10 ? 'text-green-600' :
                                                        displayProduct.stock > 0 ? 'text-yellow-600' :
                                                            'text-red-600'
                                                }`}>
                                                    {displayProduct.stock || 0}
                                                </span>
                                                <span className="text-gray-500">шт.</span>
                                            </div>
                                        </div>

                                        {/* Основные данные */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                <span className="text-sm text-gray-600">Бренд</span>
                                                <span className="font-medium">{displayProduct.brand}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                <span className="text-sm text-gray-600">Категория</span>
                                                <span className="font-medium">{displayProduct.subjectName || displayProduct.category}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                <span className="text-sm text-gray-600">Штрихкод</span>
                                                <span className="font-mono text-sm">{displayProduct.barcode || selectedProduct.barcode}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                <span className="text-sm text-gray-600">Артикул продавца</span>
                                                <span className="font-mono text-sm">{displayProduct.vendorCode}</span>
                                            </div>
                                            <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                <span className="text-sm text-gray-600">ID товара (nmID)</span>
                                                <span className="font-mono text-sm">{displayProduct.nmID}</span>
                                            </div>
                                            {displayProduct.imtID && (
                                                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                    <span className="text-sm text-gray-600">ID карточки (imtID)</span>
                                                    <span className="font-mono text-sm">{displayProduct.imtID}</span>
                                                </div>
                                            )}
                                            {displayProduct.createdAt && (
                                                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                    <span className="text-sm text-gray-600">Создан</span>
                                                    <span className="text-sm">
                                                        {new Date(displayProduct.createdAt).toLocaleDateString('ru-RU')}
                                                    </span>
                                                </div>
                                            )}
                                            {displayProduct.updatedAt && (
                                                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                                                    <span className="text-sm text-gray-600">Обновлен</span>
                                                    <span className="text-sm">
                                                        {new Date(displayProduct.updatedAt).toLocaleDateString('ru-RU')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Описание */}
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                        <FileText size={18} />
                                        Описание
                                    </h3>
                                    {isEditMode ? (
                                        <textarea
                                            value={editedProduct.description || ''}
                                            onChange={(e) => setEditedProduct({...editedProduct, description: e.target.value})}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                                            placeholder="Введите описание товара..."
                                        />
                                    ) : (
                                        <p className="text-gray-700 whitespace-pre-wrap">
                                            {displayProduct.description || 'Описание не указано'}
                                        </p>
                                    )}
                                </div>

                                {/* Характеристики товара */}
                                {displayProduct.characteristics && displayProduct.characteristics.length > 0 && (
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <Info size={18} />
                                                Характеристики товара
                                                {isEditMode && (
                                                    <span className="text-sm font-normal text-gray-500 ml-2">
                                                        (заполните необходимые поля)
                                                    </span>
                                                )}
                                            </span>
                                            {isEditMode && categoryCharacteristics.length > displayProduct.characteristics.length && (
                                                <button
                                                    onClick={() => {
                                                        // Добавляем недостающие характеристики из категории
                                                        const currentIds = new Set(editedProduct.characteristics.map(c => c.id));
                                                        const newChars = categoryCharacteristics
                                                            .filter(cat => !currentIds.has(cat.id))
                                                            .map(cat => ({
                                                                id: cat.id,
                                                                name: cat.name,
                                                                required: cat.required || false,
                                                                unitName: cat.unitName,
                                                                value: [],
                                                                popular: cat.popular || false
                                                            }));

                                                        setEditedProduct({
                                                            ...editedProduct,
                                                            characteristics: [...editedProduct.characteristics, ...newChars]
                                                        });
                                                    }}
                                                    className="text-sm text-blue-600 hover:text-blue-800"
                                                >
                                                    + Добавить все характеристики категории
                                                </button>
                                            )}
                                        </h3>

                                        {isEditMode && (
                                            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                                <div className="text-sm text-gray-600">
                                                    <span className="font-medium">Статус заполнения:</span>
                                                    <div className="flex items-center gap-4 mt-1">
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                                                            <span>Заполнено: {displayProduct.characteristics.filter(char =>
                                                                Array.isArray(char.value) ? char.value.length > 0 && char.value[0] !== '' : char.value
                                                            ).length}</span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                                                            <span>Не заполнено: {displayProduct.characteristics.filter(char =>
                                                                !char.value || (Array.isArray(char.value) && (char.value.length === 0 || char.value[0] === '')) || (!Array.isArray(char.value) && !char.value)
                                                            ).length}</span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                                                            <span>Обязательных: {displayProduct.characteristics.filter(char => char.required).length}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {displayProduct.characteristics
                                                .sort((a, b) => {
                                                    // Сортировка: обязательные -> популярные -> остальные
                                                    if (a.required && !b.required) return -1;
                                                    if (!a.required && b.required) return 1;
                                                    if (a.popular && !b.popular) return -1;
                                                    if (!a.popular && b.popular) return 1;
                                                    return 0;
                                                })
                                                .map((char, index) => {
                                                    const isFilled = Array.isArray(char.value)
                                                        ? char.value.length > 0 && char.value[0] !== ''
                                                        : !!char.value;

                                                    return (
                                                        <div key={char.id || index} className={`border rounded-lg p-3 ${
                                                            isEditMode
                                                                ? isFilled
                                                                    ? 'border-green-300 bg-green-50'
                                                                    : char.required
                                                                        ? 'border-red-300 bg-red-50'
                                                                        : 'border-gray-200 bg-yellow-50'
                                                                : 'border-gray-100'
                                                        }`}>
                                                            <div className="font-medium text-gray-800 mb-1 flex items-center gap-1">
                                                                {char.name}
                                                                {char.required && <span className="text-red-500">*</span>}
                                                                {char.popular && !char.required && (
                                                                    <Star size={12} className="text-yellow-500 fill-current" title="Популярная характеристика" />
                                                                )}
                                                                {isEditMode && (
                                                                    <span className={`ml-auto text-xs ${
                                                                        isFilled ? 'text-green-600' : 'text-gray-400'
                                                                    }`}>
                                                                        {isFilled ? '✓' : '○'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isEditMode ? (
                                                                <input
                                                                    type="text"
                                                                    value={Array.isArray(char.value) ? char.value[0] || '' : char.value || ''}
                                                                    onChange={(e) => updateCharacteristic(char.id, e.target.value)}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    placeholder={char.required ? 'Обязательное поле' : char.popular ? 'Рекомендуется заполнить' : 'Необязательное поле'}
                                                                />
                                                            ) : (
                                                                <div className="text-sm text-gray-600">
                                                                    {Array.isArray(char.value)
                                                                        ? (char.value.length > 0 ? char.value.join(', ') : 'Не указано')
                                                                        : (char.value || 'Не указано')
                                                                    }
                                                                </div>
                                                            )}
                                                            {char.unitName && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    Единица: {char.unitName}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                                {/* Панель массовых действий */}
                                {selectedProductIds.size > 0 && (
                                    <div className="bg-blue-50 border-y border-blue-200 px-4 py-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-blue-700">
                    Выбрано товаров: {selectedProductIds.size}
                </span>
                                                <button
                                                    onClick={clearSelection}
                                                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                                                >
                                                    Снять выделение
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={openBulkEditModal}
                                                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                                >
                                                    <Edit3 size={16} />
                                                    Редактировать выбранные
                                                </button>
                                                <button
                                                    className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 flex items-center gap-2"
                                                >
                                                    <DollarSign size={16} />
                                                    Изменить цены
                                                </button>
                                                <button
                                                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-2"
                                                >
                                                    <Trash2 size={16} />
                                                    Удалить
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Размеры товара */}
                                {displayProduct.sizes && displayProduct.sizes.length > 0 && (
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                            <Tag size={18}/>
                                            Размеры и SKU
                                        </h3>
                                        <div className="space-y-3">
                                            {displayProduct.sizes.map((size, index) => (
                                                <div key={index} className="border border-gray-100 rounded-lg p-3">
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                                        {(size.techSize || isEditMode) && (
                                                            <div>
                                                                <span className="text-gray-600">Тех. размер:</span>
                                                                <div
                                                                    className="font-medium">{size.techSize || 'Не указан'}</div>
                                                            </div>
                                                        )}
                                                        {(size.wbSize || isEditMode) && (
                                                            <div>
                                                                <span className="text-gray-600">Размер WB:</span>
                                                                <div
                                                                    className="font-medium">{size.wbSize || 'Не указан'}</div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="text-gray-600">Цена:</span>
                                                            {isEditMode ? (
                                                                <input
                                                                    type="number"
                                                                    value={size.price || 0}
                                                                    onChange={(e) => updateSize(index, 'price', parseInt(e.target.value) || 0)}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                                    min="0"
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="font-medium">₽{(size.price || 0).toLocaleString()}</div>
                                                            )}
                                                        </div>
                                                        {size.skus && size.skus.length > 0 && (
                                                            <div>
                                                                <span className="text-gray-600">SKU:</span>
                                                                <div
                                                                    className="font-mono text-xs">{size.skus.join(', ')}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                                <Tag size={18}/>
                                                Размеры и SKU
                                            </h3>
                                            {isEditMode && (
                                                <button
                                                    onClick={() => {
                                                        const newSize = {
                                                            techSize: "0",
                                                            wbSize: "",
                                                            skus: [],
                                                            price: editedProduct.sizes?.[0]?.price || 0
                                                        };
                                                        setEditedProduct({
                                                            ...editedProduct,
                                                            sizes: [...(editedProduct.sizes || []), newSize]
                                                        });
                                                    }}
                                                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
                                                >
                                                    <Plus size={16}/>
                                                    Добавить размер
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Габариты */}
                                {displayProduct.dimensions && (
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                            <Box size={18}/>
                                            Габариты товара
                                        </h3>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-sm text-gray-600 block mb-1">Длина (см)</label>
                                                {isEditMode ? (
                                                    <input
                                                        type="number"
                                                        value={editedProduct.dimensions.length || ''}
                                                        onChange={(e) => setEditedProduct({
                                                            ...editedProduct,
                                                            dimensions: {...editedProduct.dimensions, length: e.target.value}
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <div className="font-medium">{displayProduct.dimensions.length || 'Не указано'}</div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-sm text-gray-600 block mb-1">Ширина (см)</label>
                                                {isEditMode ? (
                                                    <input
                                                        type="number"
                                                        value={editedProduct.dimensions.width || ''}
                                                        onChange={(e) => setEditedProduct({
                                                            ...editedProduct,
                                                            dimensions: {...editedProduct.dimensions, width: e.target.value}
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <div className="font-medium">{displayProduct.dimensions.width || 'Не указано'}</div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-sm text-gray-600 block mb-1">Высота (см)</label>
                                                {isEditMode ? (
                                                    <input
                                                        type="number"
                                                        value={editedProduct.dimensions.height || ''}
                                                        onChange={(e) => setEditedProduct({
                                                            ...editedProduct,
                                                            dimensions: {...editedProduct.dimensions, height: e.target.value}
                                                        })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0"
                                                    />
                                                ) : (
                                                    <div className="font-medium">{displayProduct.dimensions.height || 'Не указано'}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Видео */}
                                {(displayProduct.video || isEditMode) && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                        <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                            <FileText size={18} />
                                            Видео товара
                                        </h3>
                                        {isEditMode ? (
                                            <input
                                                type="text"
                                                value={editedProduct.video || ''}
                                                onChange={(e) => setEditedProduct({...editedProduct, video: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Ссылка на видео..."
                                            />
                                        ) : (
                                            <p className="text-gray-700">
                                                {displayProduct.video ? (
                                                    <a href={displayProduct.video} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                        Смотреть видео
                                                    </a>
                                                ) : (
                                                    'Видео не добавлено'
                                                )}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Теги */}
                                {displayProduct.tags && displayProduct.tags.length > 0 && (
                                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                                        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                            <Tag size={18} />
                                            Теги
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {displayProduct.tags.map((tag, index) => (
                                                <span
                                                    key={index}
                                                    className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                                                >
                                                    {tag.name || tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <AlertCircle className="mx-auto text-red-400 mb-4" size={48} />
                                <p className="text-gray-600">Не удалось загрузить детали товара</p>
                                <button
                                    onClick={() => fetchProductDetails(selectedProduct)}
                                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Попробовать снова
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderBulkEditModal = () => {
        if (!showBulkEditModal) return null;

        const selectedProducts = products.filter(p => selectedProductIds.has(p.nmID));
        const categories = [...new Set(selectedProducts.map(p => p.category))];

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                    {/* Заголовок */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">
                                Массовое редактирование товаров
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Выбрано {selectedProductIds.size} товаров
                                {categories.length === 1 && ` • Категория: ${categories[0]}`}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowBulkEditModal(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Содержимое */}
                    <div className="p-6">
                        {/* Предупреждение */}
                        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-yellow-600 mt-0.5" size={20} />
                                <div>
                                    <p className="text-sm font-medium text-yellow-800">
                                        Внимание! Массовое редактирование
                                    </p>
                                    <p className="text-sm text-yellow-700 mt-1">
                                        Изменения будут применены ко всем выбранным товарам.
                                        Отметьте только те поля, которые хотите изменить.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Общие поля */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-gray-800">Общие параметры</h3>

                            {/* Бренд */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <label className="flex items-center gap-3 mb-3">
                                    <input
                                        type="checkbox"
                                        checked={bulkEditData.brand.enabled}
                                        onChange={(e) => setBulkEditData({
                                            ...bulkEditData,
                                            brand: { ...bulkEditData.brand, enabled: e.target.checked }
                                        })}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="font-medium text-gray-700">Изменить бренд</span>
                                </label>
                                {bulkEditData.brand.enabled && (
                                    <input
                                        type="text"
                                        value={bulkEditData.brand.value}
                                        onChange={(e) => setBulkEditData({
                                            ...bulkEditData,
                                            brand: { ...bulkEditData.brand, value: e.target.value }
                                        })}
                                        placeholder="Введите новый бренд"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                )}
                            </div>

                            {/* Габариты */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <label className="flex items-center gap-3 mb-3">
                                    <input
                                        type="checkbox"
                                        checked={bulkEditData.dimensions.enabled}
                                        onChange={(e) => setBulkEditData({
                                            ...bulkEditData,
                                            dimensions: { ...bulkEditData.dimensions, enabled: e.target.checked }
                                        })}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="font-medium text-gray-700">Изменить габариты</span>
                                </label>
                                {bulkEditData.dimensions.enabled && (
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Длина (см)</label>
                                            <input
                                                type="number"
                                                value={bulkEditData.dimensions.value.length}
                                                onChange={(e) => setBulkEditData({
                                                    ...bulkEditData,
                                                    dimensions: {
                                                        ...bulkEditData.dimensions,
                                                        value: { ...bulkEditData.dimensions.value, length: e.target.value }
                                                    }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Ширина (см)</label>
                                            <input
                                                type="number"
                                                value={bulkEditData.dimensions.value.width}
                                                onChange={(e) => setBulkEditData({
                                                    ...bulkEditData,
                                                    dimensions: {
                                                        ...bulkEditData.dimensions,
                                                        value: { ...bulkEditData.dimensions.value, width: e.target.value }
                                                    }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Высота (см)</label>
                                            <input
                                                type="number"
                                                value={bulkEditData.dimensions.value.height}
                                                onChange={(e) => setBulkEditData({
                                                    ...bulkEditData,
                                                    dimensions: {
                                                        ...bulkEditData.dimensions,
                                                        value: { ...bulkEditData.dimensions.value, height: e.target.value }
                                                    }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Характеристики (если все товары одной категории) */}
                            {categories.length === 1 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                        Характеристики категории "{categories[0]}"
                                    </h3>
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                        <p className="text-sm text-blue-700">
                                            Все выбранные товары относятся к одной категории.
                                            Вы можете изменить общие характеристики.
                                        </p>
                                    </div>
                                    {/* Здесь будет список характеристик категории */}
                                    <div className="text-sm text-gray-500 text-center py-8">
                                        Загрузка характеристик категории...
                                    </div>
                                </div>
                            )}

                            {categories.length > 1 && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                                    <Info className="mx-auto text-gray-400 mb-2" size={24} />
                                    <p className="text-sm text-gray-600">
                                        Выбраны товары из разных категорий ({categories.length}).
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        Можно изменить только общие параметры.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Кнопки действий */}
                        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                            <button
                                onClick={() => setShowBulkEditModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={applyBulkChanges}
                                disabled={bulkSaving || (!bulkEditData.brand.enabled && !bulkEditData.dimensions.enabled)}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {bulkSaving ? (
                                    <>
                                        <Loader className="animate-spin" size={16} />
                                        Применение изменений...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Применить изменения
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderDashboard = () => (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Дашборд</h2>
                <div className="flex flex-wrap gap-3">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                        <option value="today">Сегодня</option>
                        <option value="week">Неделя</option>
                        <option value="month">Месяц</option>
                        <option value="year">Год</option>
                    </select>
                    <button
                        onClick={() => fetchMarketplaceData(selectedMarketplace)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                        Обновить
                    </button>
                </div>
            </div>

            {loading && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                    <Loader className="animate-spin text-blue-600" size={20} />
                    <div>
                        <span className="text-blue-700 font-medium">Загрузка данных с Wildberries API...</span>
                        <p className="text-xs text-blue-600 mt-1">
                            Получаем карточки товаров, остатки на складах и новые заказы
                        </p>
                    </div>
                </div>
            )}

            {lastSync && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={16} />
                    <span className="text-sm text-green-700">
            Последняя синхронизация: <strong>{lastSync}</strong>
          </span>
                </div>
            )}

            {/* Статус загрузки товаров */}
            {!loading && products.length === 0 && apiKeys.wildberries && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Package className="text-blue-600" size={20} />
                        </div>
                        <div>
                            <h4 className="font-medium text-blue-800 mb-1">Готово к загрузке товаров</h4>
                            <p className="text-sm text-blue-700 mb-3">
                                API Wildberries настроен. Нажмите "Загрузить товары" в разделе "Товары" или воспользуйтесь поиском по конкретному артикулу.
                            </p>
                            <button
                                onClick={() => setActiveTab('products')}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                            >
                                Перейти к товарам
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Информация о количестве загруженных товаров */}
            {products.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CheckCircle className="text-green-600" size={16} />
                            <span className="text-sm text-green-700">
                Загружено товаров: <strong>{products.length}</strong>
                                {totalProducts > products.length && ` из ${totalProducts}`}
                                {searchQuery && ` (поиск: "${searchQuery}")`}
              </span>
                        </div>
                        {hasMoreProducts && !searchQuery && (
                            <button
                                onClick={() => setActiveTab('products')}
                                className="text-xs text-green-600 hover:text-green-800 underline"
                            >
                                Загрузить еще
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-100 rounded-lg">
                            <DollarSign className="text-green-600" size={24} />
                        </div>
                        <span className="text-green-500 text-sm font-medium flex items-center gap-1">
              <TrendingUp size={16} />
              +12.5%
            </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">₽{metrics.totalRevenue.toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mt-1">Общая выручка</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <ShoppingCart className="text-blue-600" size={24} />
                        </div>
                        <span className="text-green-500 text-sm font-medium flex items-center gap-1">
              <TrendingUp size={16} />
              +8.3%
            </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">{orders.length}</div>
                    <div className="text-sm text-gray-500 mt-1">Всего заказов</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-100 rounded-lg">
                            <Package className="text-purple-600" size={24} />
                        </div>
                        <span className="text-red-500 text-sm font-medium flex items-center gap-1">
              <TrendingDown size={16} />
              -2.1%
            </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">₽{metrics.averageCheck.toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mt-1">Средний чек</div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-orange-100 rounded-lg">
                            <Box className="text-orange-600" size={24} />
                        </div>
                        <span className="text-yellow-500 text-sm font-medium">
              {products.length} SKU {totalProducts > products.length && `из ${totalProducts}`}
            </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800">₽{metrics.stockValue.toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mt-1">Товары на складе</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Продажи за неделю</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={salesData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" stroke="#666" />
                            <YAxis stroke="#666" />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="sales"
                                stroke="#3B82F6"
                                strokeWidth={3}
                                dot={{ fill: '#3B82F6', r: 6 }}
                                activeDot={{ r: 8 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Распределение по маркетплейсам</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={marketplaceData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {marketplaceData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-6 mt-4">
                        {marketplaceData.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span className="text-sm text-gray-600">{item.name} ({item.value}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Топ категории по продажам</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={categoryData} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" stroke="#666" />
                        <YAxis dataKey="name" type="category" stroke="#666" width={100} />
                        <Tooltip />
                        <Bar dataKey="sales" fill="#8B5CF6" radius={[0, 8, 8, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    const renderProducts = () => (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Управление товарами</h2>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                        onClick={syncProductStocks}
                        disabled={loading || !apiKeys.wildberries}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        title="Синхронизировать остатки с Wildberries"
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                        Остатки
                    </button>
                    <button
                        onClick={syncProductPrices}
                        disabled={loading || !apiKeys.wildberries}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        title="Синхронизировать цены с Wildberries"
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <DollarSign size={18} />}
                        Цены
                    </button>
                    <button
                        onClick={() => {
                            clearProductsData();
                            fetchMarketplaceData(selectedMarketplace);
                        }}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        title="Загрузить все товары"
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <Package size={18} />}
                        Загрузить товары
                    </button>
                    <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm text-gray-700">
                        <Upload size={18} />
                        Импорт
                    </button>
                    <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm text-gray-700">
                        <Download size={18} />
                        Экспорт
                    </button>
                    <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm">
                        <Plus size={18} />
                        Добавить товар
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                    <div className="flex flex-col gap-4">
                        {/* Основная строка поиска */}
                        <div className="flex flex-col lg:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="text"
                                    placeholder="Поиск по артикулу, названию или номенклатуре WB..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        if (typeof setSearchFilters !== 'undefined') {
                                            setSearchFilters(prev => ({...prev, textSearch: e.target.value}));
                                        }
                                    }}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            if (typeof searchProducts !== 'undefined') {
                                                searchProducts(searchQuery);
                                            } else {
                                                // Fallback функция
                                                const oldSearchProducts = async (query) => {
                                                    if (!apiKeys.wildberries) {
                                                        alert('Настройте API ключ Wildberries');
                                                        return;
                                                    }

                                                    setLoading(true);
                                                    setProducts([]);
                                                    setProductsCursor(null);
                                                    setHasMoreProducts(true);

                                                    try {
                                                        const result = await fetchWBProductsWithPagination(null, query);
                                                        setProducts(result.products);
                                                        setProductsCursor(result.cursor);
                                                        setHasMoreProducts(result.hasMore);
                                                        setTotalProducts(result.total || result.products.length);
                                                        setLastSync(new Date().toLocaleString('ru-RU'));
                                                    } catch (error) {
                                                        logApiError(error, 'Wildberries');
                                                        handleWBError(error);
                                                    } finally {
                                                        setLoading(false);
                                                    }
                                                };
                                                oldSearchProducts(searchQuery);
                                            }
                                        }
                                    }}
                                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            if (typeof resetFilters !== 'undefined') {
                                                resetFilters();
                                            }
                                            fetchMarketplaceData(selectedMarketplace);
                                        }}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => {
                                        if (typeof searchProducts !== 'undefined') {
                                            searchProducts(searchQuery);
                                        } else {
                                            alert('Функция поиска не найдена. Убедитесь, что все новые функции добавлены.');
                                        }
                                    }}
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Search size={18} />
                                    Найти
                                </button>
                                <select
                                    value={selectedMarketplace === 'wildberries' ? 'wildberries' : 'all'}
                                    onChange={(e) => setSelectedMarketplace(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                >
                                    <option value="all">Все маркетплейсы</option>
                                    <option value="wildberries">Wildberries</option>
                                    <option value="ozon">Ozon</option>
                                    <option value="yandex">Яндекс.Маркет</option>
                                </select>
                            </div>
                        </div>

                        {/* Индикатор прогресса для больших запросов */}
                        {loading && loadingProgress.total > 1 && (
                            <div className="p-4 bg-blue-50 border-b border-blue-200">
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Loader className="animate-spin text-blue-600" size={20} />
                                        <div>
                                            <p className="text-blue-700 font-medium">
                                                Загрузка большого количества товаров...
                                            </p>
                                            <p className="text-xs text-blue-600">
                                                Выполнено запросов: {loadingProgress.current} из {loadingProgress.total}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-sm text-blue-600">
                {Math.round((loadingProgress.current / loadingProgress.total) * 100)}%
            </span>
                                </div>
                                <div className="w-full bg-blue-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                                    />
                                </div>
                                <p className="text-xs text-blue-600 mt-2">
                                    Соблюдаем лимиты API Wildberries (100 запросов/мин). Пожалуйста, подождите...
                                </p>
                            </div>
                        )}

                        {/* Расширенные фильтры */}
                        <details className="group">
                            <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                                <Filter size={18} />
                                Расширенные фильтры и настройки
                                <ChevronDown className="group-open:rotate-180 transition-transform" size={16} />
                            </summary>
                            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                    {/* Размер страницы */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Товаров на страницу
                                        </label>
                                        <div className="flex gap-2">
                                            <select
                                                value={showCustomPageSize ? 'custom' : pageSize}
                                                onChange={(e) => {
                                                    if (e.target.value === 'custom') {
                                                        setShowCustomPageSize(true);
                                                    } else {
                                                        const newSize = parseInt(e.target.value);
                                                        setPageSize(newSize);
                                                        setShowCustomPageSize(false);
                                                        setCustomPageSize('');
                                                        // Применяем фильтр сразу после изменения размера
                                                        searchProducts(searchQuery, searchFilters);
                                                    }
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                            >
                                                <option value={10}>10 товаров</option>
                                                <option value={30}>30 товаров</option>
                                                <option value={50}>50 товаров</option>
                                                <option value={100}>100 товаров</option>
                                                <option value={200}>200 товаров</option>
                                                <option value={500}>500 товаров</option>
                                                <option value={1000}>1000 товаров (макс. рекомендовано)</option>
                                                <option value="custom">Свой размер...</option>
                                            </select>

                                            {showCustomPageSize && (
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        value={customPageSize}
                                                        onChange={(e) => setCustomPageSize(e.target.value)}
                                                        placeholder="Кол-во"
                                                        min="1"
                                                        max="10000"
                                                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const size = parseInt(customPageSize);
                                                            if (size > 0) {
                                                                if (size > WB_API_LIMITS.maxTotalProducts) {
                                                                    if (confirm(`⚠️ Внимание! Вы запрашиваете ${size} товаров.\n\nЭто может занять много времени из-за лимитов API:\n• Максимум 100 товаров за запрос\n• Лимит 100 запросов в минуту\n\nДля загрузки ${size} товаров потребуется примерно ${Math.ceil(size / 100)} запросов и ${Math.ceil(size / 100 / 100 * 60)} секунд.\n\nПродолжить?`)) {
                                                                        setPageSize(size);
                                                                        setShowCustomPageSize(false);
                                                                        setCustomPageSize('');
                                                                        // Применяем фильтр сразу после изменения размера
                                                                        searchProducts(searchQuery, searchFilters);
                                                                    }
                                                                } else {
                                                                    setPageSize(size);
                                                                    setShowCustomPageSize(false);
                                                                    setCustomPageSize('');
                                                                    // Применяем фильтр сразу после изменения размера
                                                                    searchProducts(searchQuery, searchFilters);
                                                                }
                                                            }
                                                        }}
                                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                                    >
                                                        OK
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Информация о лимитах */}
                                        <div className="mt-2 text-xs text-gray-500">
                                            <p>Лимиты API: 100 товаров/запрос, 100 запросов/мин</p>
                                            {pageSize > 100 && (
                                                <p className="text-yellow-600">
                                                    ⚠️ Для {pageSize} товаров нужно {Math.ceil(pageSize / 100)} запросов
                                                    (~{Math.ceil(pageSize / 100 * 0.7)} сек.)
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Фильтр по фото */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Фото
                                            товара</label>
                                        <select
                                            value={typeof searchFilters !== 'undefined' ? searchFilters.withPhoto : -1}
                                            onChange={(e) => {
                                                if (typeof setSearchFilters !== 'undefined') {
                                                    setSearchFilters(prev => ({...prev, withPhoto: parseInt(e.target.value)}));
                                                }
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                        >
                                            <option value={-1}>Все товары</option>
                                            <option value={1}>Только с фото</option>
                                            <option value={0}>Только без фото</option>
                                        </select>
                                    </div>

                                    {/* Фильтр по остаткам */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Остатки товара</label>
                                        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                                            <option value="all">Все товары</option>
                                            <option value="in_stock">Есть в наличии (&gt; 0)</option>
                                            <option value="low_stock">Заканчивается (&lt; 10)</option>
                                            <option value="out_of_stock">Нет в наличии (= 0)</option>
                                            <option value="good_stock">Хорошие остатки (&gt; 50)</option>
                                        </select>
                                    </div>

                                    {/* Фильтр по статусу */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Статус товара</label>
                                        <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                                            <option value="all">Все статусы</option>
                                            <option value="active">Активные</option>
                                            <option value="out_of_stock">Нет в наличии</option>
                                            <option value="unknown">Неизвестно</option>
                                        </select>
                                    </div>

                                    {/* Сортировка */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Сортировка</label>
                                        <select
                                            value={typeof searchFilters !== 'undefined' ? `${searchFilters.sortBy}-${searchFilters.sortOrder}` : 'updatedAt-desc'}
                                            onChange={(e) => {
                                                const [sortBy, sortOrder] = e.target.value.split('-');
                                                if (typeof setSearchFilters !== 'undefined') {
                                                    setSearchFilters(prev => ({...prev, sortBy, sortOrder}));
                                                }
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                        >
                                            <option value="updatedAt-desc">Обновлено (новые)</option>
                                            <option value="updatedAt-asc">Обновлено (старые)</option>
                                            <option value="createdAt-desc">Создано (новые)</option>
                                            <option value="createdAt-asc">Создано (старые)</option>
                                            <option value="nmID-desc">ID товара (убыв.)</option>
                                            <option value="nmID-asc">ID товара (возр.)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Дополнительные чекбоксы */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={typeof searchFilters !== 'undefined' ? searchFilters.showOnlyWithStock : false}
                                            onChange={(e) => {
                                                if (typeof setSearchFilters !== 'undefined') {
                                                    setSearchFilters(prev => ({...prev, showOnlyWithStock: e.target.checked}));
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">Только с остатками</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={typeof searchFilters !== 'undefined' ? searchFilters.showOnlyActive : false}
                                            onChange={(e) => {
                                                if (typeof setSearchFilters !== 'undefined') {
                                                    setSearchFilters(prev => ({...prev, showOnlyActive: e.target.checked}));
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">Только активные</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">Со скидками</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="ml-2 text-sm text-gray-600">Требуют КиЗ</span>
                                    </label>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            if (typeof applyFilters !== 'undefined') {
                                                applyFilters();
                                            } else {
                                                alert('Функция применения фильтров не найдена. Добавьте новые функции.');
                                            }
                                        }}
                                        disabled={loading}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 text-sm"
                                    >
                                        <Filter size={16} />
                                        Применить фильтры
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (typeof resetFilters !== 'undefined') {
                                                resetFilters();
                                            }
                                            fetchMarketplaceData(selectedMarketplace);
                                        }}
                                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                                    >
                                        Сбросить все
                                    </button>
                                    <button
                                        onClick={() => {
                                            clearProductsData();
                                            fetchMarketplaceData(selectedMarketplace);
                                        }}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                    >
                                        <RefreshCw size={16} className="mr-1" />
                                        Перезагрузить
                                    </button>
                                </div>
                            </div>
                        </details>

                        {/* Информация о текущих настройках */}
                        <div className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex flex-wrap items-center gap-4">
                                <span><strong>Размер страницы:</strong> {typeof pageSize !== 'undefined' ? pageSize : 50} товаров</span>
                                <span><strong>Загружено:</strong> {products.length} товаров</span>
                                {totalProducts > 0 && <span><strong>Всего доступно:</strong> {totalProducts.toLocaleString()}</span>}
                                {searchQuery && <span><strong>Поиск:</strong> "{searchQuery}"</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Индикатор загрузки */}
                {loading && (
                    <div className="p-6 bg-blue-50 border-b border-blue-200">
                        <div className="flex items-center gap-3">
                            <Loader className="animate-spin text-blue-600" size={20} />
                            <div>
                                <p className="text-blue-700 font-medium">Синхронизация с Wildberries...</p>
                                <p className="text-xs text-blue-600">Загружаем карточки товаров и остатки со складов</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Таблица товаров с фиксированной шириной */}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 w-12">
                                <input
                                    type="checkbox"
                                    checked={products.length > 0 && selectedProductIds.size === products.length}
                                    onChange={() => {
                                        if (selectedProductIds.size === products.length) {
                                            clearSelection();
                                        } else {
                                            selectAllProducts();
                                        }
                                    }}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-80">Товар</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Артикул</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Штрихкод</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Цена</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Остаток</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Маркетплейс</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Статус</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Действия</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center">
                                    <Loader className="animate-spin mx-auto text-gray-400" size={32}/>
                                    <p className="mt-2 text-gray-500">Загрузка товаров...</p>
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan="8" className="px-6 py-12 text-center">
                                    <div className="text-gray-500">
                                        <Package className="mx-auto mb-4 text-gray-300" size={48} />
                                        <p className="text-lg font-medium">Товары не найдены</p>
                                        <p className="text-sm mt-1">
                                            {apiKeys.wildberries
                                                ? 'Возможно, в каталоге Wildberries нет товаров или произошла ошибка при загрузке'
                                                : 'Настройте API ключ Wildberries в разделе "Настройки" для загрузки товаров'
                                            }
                                        </p>
                                        {apiKeys.wildberries && (
                                            <button
                                                onClick={() => fetchMarketplaceData(selectedMarketplace)}
                                                className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                            >
                                                Попробовать снова
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={`${product.id}-${product.nmID}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-4 w-12">
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.has(product.nmID)}
                                            onChange={() => toggleProductSelection(product.nmID)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center max-w-xs">
                                            <div
                                                className="h-10 w-10 bg-gray-200 rounded-lg mr-3 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {product.photo ? (
                                                    <img
                                                        src={`${product.photo}`}
                                                        alt={product.name}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.nextSibling.style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <div
                                                    className={`${product.photo ? 'hidden' : 'flex'} items-center justify-center w-full h-full`}>
                                                    <Package className="text-gray-400" size={20}/>
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-900 truncate"
                                                     title={product.name}>
                                                    {product.name}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">{product.brand}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 font-mono truncate" title={product.sku}>
                                            {product.sku}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 font-mono truncate"
                                             title={product.barcode}>
                                            {product.barcode}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex flex-col">
                                            {product.discountedPrice && product.discountedPrice !== product.price ? (
                                                <>
                                                    <div className="flex items-center gap-1">
                                                    <span className="text-sm font-semibold text-green-600">
                                                        ₽{product.discountedPrice.toLocaleString()}
                                                    </span>
                                                        {product.discount > 0 && (
                                                            <span
                                                                className="px-1 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
                                                            -{product.discount}%
                                                        </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500 line-through">
                                                    ₽{product.price.toLocaleString()}
                                                </span>
                                                </>
                                            ) : (
                                                <span className="text-sm font-medium">
                                                ₽{product.price.toLocaleString()}
                                            </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                    <span className={`text-sm font-medium ${
                                        product.stock > 10 ? 'text-green-600' :
                                            product.stock > 0 ? 'text-yellow-600' :
                                                'text-red-600'
                                    }`}>
                                        {product.stock}
                                    </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500 truncate">{product.marketplace}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                    <span
                                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            product.status === 'active'
                                                ? 'bg-green-100 text-green-800'
                                                : product.status === 'out_of_stock'
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {product.status === 'active' ? 'Активен' :
                                            product.status === 'out_of_stock' ? 'Нет в наличии' :
                                                'Неизвестно'}
                                    </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="flex gap-1">
                                            <button
                                                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                                title="Просмотр"
                                                onClick={() => openProductCard(product)}
                                            >
                                                <Eye size={16}/>
                                            </button>
                                            <button
                                                className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-50"
                                                title="Редактировать"
                                                onClick={async () => {
                                                    await openProductCard(product);
                                                    setTimeout(() => startEditProduct(), 500);
                                                }}
                                            >
                                                <Edit size={16}/>
                                            </button>
                                            <button
                                                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                                                title="Удалить">
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                {/* Пагинация с информацией о размере страницы */}
                {products.length > 0 && hasMoreProducts && (
                    <div className="p-6 border-t border-gray-200 text-center">
                        <button
                            onClick={loadMoreProducts}
                            disabled={isLoadingMore}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoadingMore ? (
                                <>
                                    <Loader className="animate-spin" size={18} />
                                    Загружаем товары...
                                </>
                            ) : (
                                <>
                                    <ChevronDown size={18} />
                                    Загрузить еще товары ({typeof pageSize !== 'undefined' ? pageSize : 50} шт.)
                                </>
                            )}
                        </button>
                        <div className="mt-3 space-y-1">
                            <p className="text-sm text-gray-600">
                                Загружено: <strong>{products.length}</strong> товаров
                                {totalProducts > 0 && ` из ${totalProducts.toLocaleString()}`}
                            </p>
                            <p className="text-xs text-gray-500">
                                Размер страницы: {typeof pageSize !== 'undefined' ? pageSize : 50} товаров •
                                {hasMoreProducts ? ` Еще доступно для загрузки` : ' Все товары загружены'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Информация о завершении загрузки */}
                {products.length > 0 && !hasMoreProducts && (
                    <div className="p-4 border-t border-gray-200 text-center">
                        <div className="flex items-center justify-center gap-2 text-gray-500">
                            <CheckCircle size={18} className="text-green-500" />
                            <span>
                            Все товары загружены
                            ({products.length.toLocaleString()} {totalProducts > 0 ? `из ${totalProducts.toLocaleString()}` : ''} шт.)
                        </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            Размер страницы: {typeof pageSize !== 'undefined' ? pageSize : 50} товаров • Используйте фильтры для уточнения результатов
                        </p>
                    </div>
                )}

                {/* Информация для результатов поиска с фильтрами */}
                {products.length > 0 && (searchQuery || (typeof searchFilters !== 'undefined' && Object.values(searchFilters).some(v => v !== searchFilters.textSearch && v !== '' && v !== -1 && v !== false && v !== 'updatedAt' && v !== 'desc'))) && (
                    <div className="p-4 border-t border-gray-200 text-center">
                        <div className="flex items-center justify-center gap-2 text-blue-600">
                            <Search size={18} />
                            <span>
                            Результаты поиска/фильтрации: {products.length} товаров
                                {totalProducts > products.length && ` из ${totalProducts}`}
                        </span>
                        </div>
                        {hasMoreProducts && (
                            <button
                                onClick={loadMoreProducts}
                                disabled={isLoadingMore}
                                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto disabled:opacity-50"
                            >
                                {isLoadingMore ? (
                                    <>
                                        <Loader className="animate-spin" size={16} />
                                        Загрузка...
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={16} />
                                        Загрузить еще
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Модальные окна */}
            {renderProductModal()}
            {renderBulkEditModal()}
        </div>
    );

    const renderOrders = () => (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Управление заказами</h2>
                <div className="flex flex-wrap gap-3">
                    <select
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900">
                        <option value="all">Все статусы</option>
                        <option value="pending">Ожидает обработки</option>
                        <option value="processing">В обработке</option>
                        <option value="shipped">Отправлен</option>
                        <option value="delivered">Доставлен</option>
                    </select>
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <Download size={18}/>
                        Экспорт заказов
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Clock className="text-yellow-600" size={24} />
                        <span className="text-2xl font-bold text-yellow-800">
              {orders.filter(o => o.status === 'pending').length}
            </span>
                    </div>
                    <div className="text-sm text-yellow-700">Ожидает обработки</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <RefreshCw className="text-blue-600" size={24} />
                        <span className="text-2xl font-bold text-blue-800">
              {orders.filter(o => o.status === 'processing').length}
            </span>
                    </div>
                    <div className="text-sm text-blue-700">В обработке</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Package className="text-purple-600" size={24} />
                        <span className="text-2xl font-bold text-purple-800">
              {orders.filter(o => o.status === 'shipped').length}
            </span>
                    </div>
                    <div className="text-sm text-purple-700">Отправлено</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <CheckCircle className="text-green-600" size={24} />
                        <span className="text-2xl font-bold text-green-800">
              {orders.filter(o => o.status === 'delivered').length}
            </span>
                    </div>
                    <div className="text-sm text-green-700">Доставлено</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№ Заказа</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Покупатель</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Товаров</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сумма</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Доставка</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Маркетплейс</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan="9" className="px-6 py-12 text-center">
                                    <Loader className="animate-spin mx-auto text-gray-400" size={32} />
                                    <p className="mt-2 text-gray-500">Загрузка заказов...</p>
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan="9" className="px-6 py-12 text-center text-gray-500">
                                    Заказы не найдены
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{order.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.date}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.customer}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.items} шт.</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₽{order.total.toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.deliveryDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.marketplace}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                              order.status === 'shipped' ? 'bg-purple-100 text-purple-800' :
                                  order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                      'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.status === 'delivered' ? 'Доставлен' :
                            order.status === 'shipped' ? 'Отправлен' :
                                order.status === 'processing' ? 'В обработке' :
                                    'Ожидает'}
                      </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <button className="text-blue-600 hover:text-blue-800">
                                            <Eye size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderSettings = () => (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Настройки интеграций</h2>
                <div className="text-sm text-gray-500">
                    Подключите API для автоматизации работы
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <AlertCircle className="text-blue-600" size={20} />
                    </div>
                    <div>
                        <h4 className="font-medium text-blue-800 mb-2">Пошаговая настройка API Wildberries</h4>
                        <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                            <li>Откройте личный кабинет Wildberries → <strong>Настройки → Доступ к API</strong></li>
                            <li>Нажмите <strong>"Создать новый токен"</strong></li>
                            <li>Выберите категории доступа:
                                <ul className="ml-4 mt-1 space-y-1 list-disc list-inside">
                                    <li><strong>Контент</strong> - для управления товарами</li>
                                    <li><strong>Маркетплейс</strong> - для заказов и остатков</li>
                                    <li><strong>Цены и скидки</strong> - для синхронизации цен</li>
                                    <li><strong>Статистика</strong> - для аналитики (опционально)</li>
                                </ul>
                            </li>
                            <li>Скопируйте токен <strong>(64 символа)</strong> - он показывается только один раз!</li>
                            <li>Вставьте токен в поле ниже и нажмите <strong>"Сохранить"</strong></li>
                            <li>Нажмите <strong>"Тестировать"</strong> для проверки подключения</li>
                        </ol>
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                            ⚠️ <strong>Важно:</strong> Токен действует 180 дней, после чего нужно создать новый. Храните токен в безопасности - восстановить его нельзя!
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Store className="text-purple-600" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Wildberries</h3>
                                <p className="text-sm text-gray-500">API интеграция • Реальные данные</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 ${apiKeys.wildberries ? 'bg-green-500' : 'bg-gray-400'} rounded-full`}></div>
                            <span className={`text-sm ${apiKeys.wildberries ? 'text-green-600' : 'text-gray-600'}`}>
                {apiKeys.wildberries ? 'Подключено' : 'Не настроено'}
              </span>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">API ключ</label>
                            <input
                                type="password"
                                value={apiKeys.wildberries}
                                onChange={(e) => setApiKeys({...apiKeys, wildberries: e.target.value.trim()})}
                                placeholder="Введите API ключ (64 символа)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Получить в ЛК → Настройки → Доступ к API. Выберите категории: Контент, Маркетплейс и Цены.
                            </p>
                            {apiKeys.wildberries && apiKeys.wildberries.length !== 64 && (
                                <p className="text-xs text-red-500 mt-1">
                                    ⚠️ API ключ должен содержать ровно 64 символа (сейчас: {apiKeys.wildberries.length})
                                </p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={saveApiKeys}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                                Сохранить
                            </button>
                            <button
                                onClick={() => testApiConnection('Wildberries')}
                                disabled={loading || !apiKeys.wildberries}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Тестирование...' : 'Тестировать'}
                            </button>
                        </div>
                        {apiKeys.wildberries && (
                            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-sm text-green-700 font-medium mb-2">
                                    ✅ Интеграция настроена и готова к работе
                                </p>
                                <div className="text-xs text-green-600 space-y-1">
                                    <p><strong>Доступные функции:</strong></p>
                                    <ul className="ml-3 space-y-1 list-disc list-inside">
                                        <li>Автоматическая загрузка карточек товаров с настраиваемым размером страницы
                                            (10-1000 товаров)
                                        </li>
                                        <li>Расширенный поиск и фильтрация (по фото, остаткам, статусу)</li>
                                        <li>Получение новых заказов (сборочных заданий)</li>
                                        <li>Синхронизация остатков товаров на складах с кэшированием</li>
                                        <li>Получение и обновление цен товаров (улучшенный алгоритм)</li>
                                        <li>Редактирование карточек товаров с расширенной валидацией</li>
                                        <li>Управление характеристиками товаров (обязательные/популярные)</li>
                                        <li>Мониторинг скидок и акций</li>
                                        <li>Мониторинг статусов заказов</li>
                                        <li>Проверка маркировки "Честный знак" (новое поле needKiz)</li>
                                        <li>Тестирование подключения к API с детальной диагностикой</li>
                                    </ul>
                                    <div className="mt-2 pt-2 border-t border-green-300">
                                        <p><strong>Лимиты API:</strong> Контент 100 req/min • Маркетплейс 300 req/min •
                                            Цены 100 req/min</p>
                                        <p><strong>Максимальные размеры:</strong> Карточки до 3000 nmID/запрос • SKU до
                                            1000/запрос</p>
                                        <p><strong>Срок действия токена:</strong> 180 дней с момента создания</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Store className="text-blue-600" size={24}/>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Ozon</h3>
                                <p className="text-sm text-gray-500">API интеграция • В разработке</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div
                                className={`w-2 h-2 ${apiKeys.ozon.apiKey ? 'bg-yellow-500' : 'bg-gray-400'} rounded-full`}></div>
                            <span className={`text-sm ${apiKeys.ozon.apiKey ? 'text-yellow-600' : 'text-gray-600'}`}>
                {apiKeys.ozon.apiKey ? 'В разработке' : 'Не настроено'}
              </span>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                            <input
                                type="text"
                                value={apiKeys.ozon.clientId}
                                onChange={(e) => setApiKeys({...apiKeys, ozon: {...apiKeys.ozon, clientId: e.target.value}})}
                                placeholder="Введите Client ID"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">API ключ</label>
                            <input
                                type="password"
                                value={apiKeys.ozon.apiKey}
                                onChange={(e) => setApiKeys({...apiKeys, ozon: {...apiKeys.ozon, apiKey: e.target.value}})}
                                placeholder="Введите API ключ"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={saveApiKeys}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                                Сохранить
                            </button>
                            <button
                                onClick={() => testApiConnection('Ozon')}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                            >
                                Тестировать
                            </button>
                        </div>
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-700">
                                ⚠️ Интеграция с Ozon API находится в разработке
                            </p>
                            <p className="text-xs text-yellow-600 mt-1">
                                Планируется в следующей версии приложения
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                                <Store className="text-orange-600" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Яндекс.Маркет</h3>
                                <p className="text-sm text-gray-500">API интеграция • В разработке</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 ${apiKeys.yandex ? 'bg-yellow-500' : 'bg-gray-400'} rounded-full`}></div>
                            <span className={`text-sm ${apiKeys.yandex ? 'text-yellow-600' : 'text-gray-600'}`}>
                {apiKeys.yandex ? 'В разработке' : 'Не настроено'}
              </span>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OAuth токен</label>
                            <input
                                type="password"
                                value={apiKeys.yandex}
                                onChange={(e) => setApiKeys({...apiKeys, yandex: e.target.value})}
                                placeholder="Введите OAuth токен"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                            />
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={saveApiKeys}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                                Сохранить
                            </button>
                            <button
                                onClick={() => testApiConnection('Яндекс.Маркет')}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                            >
                                Тестировать
                            </button>
                        </div>
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-700">
                                ⚠️ Интеграция с Яндекс.Маркет API находится в разработке
                            </p>
                            <p className="text-xs text-yellow-600 mt-1">
                                Планируется в следующей версии приложения
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Plus className="text-gray-600" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">Добавить маркетплейс</h3>
                                <p className="text-sm text-gray-500">Подключите новую площадку</p>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <p className="text-sm text-gray-500">Расширьте возможности системы, добавив новые маркетплейсы</p>
                        <button className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm w-full">
                            Добавить
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Мониторинг API</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-purple-700">Wildberries</span>
                            <span className="text-xs text-purple-600">100 req/min</span>
                        </div>
                        <div className="text-2xl font-bold text-purple-800">
                            {apiKeys.wildberries ? '✓' : '✗'}
                        </div>
                        <div className="text-xs text-purple-600 mt-1">
                            {apiKeys.wildberries ? 'Активна' : 'Не подключена'}
                        </div>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-blue-700">Ozon</span>
                            <span className="text-xs text-blue-600">В разработке</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-800">
                            {apiKeys.ozon.apiKey ? '⚠' : '✗'}
                        </div>
                        <div className="text-xs text-blue-600 mt-1">
                            {apiKeys.ozon.apiKey ? 'Ожидает' : 'Не подключена'}
                        </div>
                    </div>

                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-orange-700">Яндекс.Маркет</span>
                            <span className="text-xs text-orange-600">В разработке</span>
                        </div>
                        <div className="text-2xl font-bold text-orange-800">
                            {apiKeys.yandex ? '⚠' : '✗'}
                        </div>
                        <div className="text-xs text-orange-600 mt-1">
                            {apiKeys.yandex ? 'Ожидает' : 'Не подключена'}
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2">Полезная информация</h4>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                            <h5 className="font-medium text-gray-700 mb-1">Лимиты API Wildberries:</h5>
                            <ul className="space-y-1">
                                <li>• Контент: 100 запросов/минуту</li>
                                <li>• Маркетплейс: 300 запросов/минуту</li>
                                <li>• Цены и скидки: 100 запросов/минуту</li>
                                <li>• При ошибке 409: считается как 5 запросов</li>
                                <li>• При превышении: ошибка 429</li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-medium text-gray-700 mb-1">Доступность API:</h5>
                            <ul className="space-y-1">
                                <li>• Контент: доступно всем продавцам</li>
                                <li>• Маркетплейс: доступно всем продавцам</li>
                                <li>• Цены: доступно при наличии соответствующих прав</li>
                                <li>• Все API работают стабильно при правильной настройке</li>
                            </ul>
                        </div>
                        <div>
                            <h5 className="font-medium text-gray-700 mb-1">Требования к токену:</h5>
                            <ul className="space-y-1">
                                <li>• Длина: ровно 64 символа</li>
                                <li>• Срок действия: 180 дней</li>
                                <li>• Показывается только при создании</li>
                                <li>• Нельзя восстановить - только пересоздать</li>
                            </ul>
                        </div>
                    </div>

                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                        <p className="text-blue-700">
                            <strong>💡 Совет:</strong> Регулярно проверяйте срок действия токена. За 30 дней до истечения создайте новый токен и обновите настройки.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Настройки синхронизации</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-gray-700">Автоматическая синхронизация товаров</p>
                            <p className="text-sm text-gray-500">Обновление данных каждые 30 минут</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Журнал API запросов</h3>
                    <div className="flex items-center gap-2">
                        {lastSync && (
                            <span className="text-xs text-green-600">
                Последняя синхронизация: {lastSync}
              </span>
                        )}
                        <button
                            onClick={clearApiErrors}
                            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                            Очистить
                        </button>
                    </div>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                    {apiErrors.length > 0 ? (
                        apiErrors.map(error => (
                            <div key={error.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-red-700">{error.marketplace}</span>
                                    <span className="text-xs text-red-500">{error.timestamp}</span>
                                </div>
                                <div className="text-xs text-red-600 mt-1">
                                    {error.error}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-sm text-gray-500">Ошибок API запросов не обнаружено</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderProfile = () => (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Личный кабинет</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Профиль</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                                    <input
                                        type="text"
                                        value={userProfile.name}
                                        onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={userProfile.email}
                                        onChange={(e) => setUserProfile({...userProfile, email: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                                    <input
                                        type="tel"
                                        value={userProfile.phone}
                                        onChange={(e) => setUserProfile({...userProfile, phone: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Компания</label>
                                    <input
                                        type="text"
                                        value={userProfile.company}
                                        onChange={(e) => setUserProfile({...userProfile, company: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
                                    <input
                                        type="text"
                                        value={userProfile.inn}
                                        onChange={(e) => setUserProfile({...userProfile, inn: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                    />
                                </div>
                            </div>
                            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                                <Save size={18} />
                                Сохранить изменения
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Безопасность</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Текущий пароль</label>
                                <input
                                    type="password"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
                                <input
                                    type="password"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Подтвердите новый пароль</label>
                                <input
                                    type="password"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                                />
                            </div>
                            <button className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2">
                                <Lock size={18} />
                                Изменить пароль
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Тарифный план</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-lg font-semibold text-blue-800">Professional</span>
                                    <span className="text-2xl font-bold text-blue-800">₽9,990</span>
                                </div>
                                <p className="text-sm text-blue-700 mb-3">в месяц</p>
                                <ul className="space-y-2 text-sm text-gray-700">
                                    <li className="flex items-center gap-2">
                                        <Check className="text-green-500" size={16} />
                                        До 10 000 товаров
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Check className="text-green-500" size={16} />
                                        3 маркетплейса
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Check className="text-green-500" size={16} />
                                        100 000 API запросов/месяц
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Check className="text-green-500" size={16} />
                                        Приоритетная поддержка
                                    </li>
                                </ul>
                            </div>
                            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                Изменить тариф
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Использование API</h3>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-600">Использовано</span>
                                    <span className="font-medium text-gray-800">
                    {userProfile.apiUsage.current.toLocaleString()} / {userProfile.apiUsage.limit.toLocaleString()}
                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full"
                                        style={{ width: `${(userProfile.apiUsage.current / userProfile.apiUsage.limit) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">Лимит обновляется каждый месяц</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Баланс</h3>
                        <div className="space-y-3">
                            <div className="text-3xl font-bold text-gray-800">
                                ₽{userProfile.balance.toLocaleString()}
                            </div>
                            <p className="text-sm text-gray-500">Доступно для вывода</p>
                            <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                                Вывести средства
                            </button>
                            <button className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                                История операций
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="flex h-screen">
                {/* Sidebar */}
                <div className="hidden lg:block w-64 bg-white shadow-lg flex-shrink-0 overflow-y-auto">
                    <div className="p-6">
                        <h1 className="text-2xl font-bold text-gray-800">MP Manager</h1>
                        <p className="text-sm text-gray-500 mt-1">Система управления</p>
                    </div>
                    <nav className="mt-6">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <Home size={20} />
                            <span className="font-medium">Дашборд</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'products' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <Package size={20} />
                            <span className="font-medium">Товары</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'orders' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <ShoppingCart size={20} />
                            <span className="font-medium">Заказы</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'analytics' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <BarChart3 size={20} />
                            <span className="font-medium">Аналитика</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'settings' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <Settings size={20} />
                            <span className="font-medium">Настройки</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`w-full px-6 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors ${
                                activeTab === 'profile' ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700'
                            }`}
                        >
                            <User size={20} />
                            <span className="font-medium">Личный кабинет</span>
                        </button>
                    </nav>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden">
                    <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
                        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                {/* Mobile menu button */}
                                <button className="lg:hidden p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
                                    <Settings size={20} />
                                </button>
                                <select
                                    value={selectedMarketplace}
                                    onChange={(e) => setSelectedMarketplace(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 shadow-sm"
                                >
                                    <option value="all">Все маркетплейсы</option>
                                    <option value="wildberries">Wildberries</option>
                                    <option value="ozon">Ozon</option>
                                    <option value="yandex">Яндекс.Маркет</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-4">
                                <button className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg">
                                    <Bell size={20} />
                                    <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('profile')}
                                    className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors"
                                >
                                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                                        <User size={20} className="text-gray-600" />
                                    </div>
                                    <div className="text-left hidden sm:block">
                                        <p className="text-sm font-medium text-gray-700">{userProfile.name}</p>
                                        <p className="text-xs text-gray-500">{userProfile.email}</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 overflow-y-auto bg-gray-50">
                        <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
                            {activeTab === 'dashboard' && renderDashboard()}
                            {activeTab === 'products' && renderProducts()}
                            {activeTab === 'orders' && renderOrders()}
                            {activeTab === 'analytics' && renderDashboard()}
                            {activeTab === 'settings' && renderSettings()}
                            {activeTab === 'profile' && renderProfile()}
                        </div>
                    </main>

                    {/* Mobile Navigation */}
                    <div className="lg:hidden bg-white border-t border-gray-200 flex overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`flex-1 min-w-0 px-4 py-3 text-xs font-medium text-center ${
                                activeTab === 'dashboard'
                                    ? 'text-blue-600 border-t-2 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Home size={20} className="mx-auto mb-1" />
                            Дашборд
                        </button>
                        <button
                            onClick={() => setActiveTab('products')}
                            className={`flex-1 min-w-0 px-4 py-3 text-xs font-medium text-center ${
                                activeTab === 'products'
                                    ? 'text-blue-600 border-t-2 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Package size={20} className="mx-auto mb-1" />
                            Товары
                        </button>
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`flex-1 min-w-0 px-4 py-3 text-xs font-medium text-center ${
                                activeTab === 'orders'
                                    ? 'text-blue-600 border-t-2 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <ShoppingCart size={20} className="mx-auto mb-1" />
                            Заказы
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`flex-1 min-w-0 px-4 py-3 text-xs font-medium text-center ${
                                activeTab === 'settings'
                                    ? 'text-blue-600 border-t-2 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <Settings size={20} className="mx-auto mb-1" />
                            Настройки
                        </button>
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`flex-1 min-w-0 px-4 py-3 text-xs font-medium text-center ${
                                activeTab === 'profile'
                                    ? 'text-blue-600 border-t-2 border-blue-600'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <User size={20} className="mx-auto mb-1" />
                            Профиль
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const startEditProduct = () => {
    if (productDetails) {
        // Создаем глубокую копию и преобразуем характеристики в правильный формат
        const editableProduct = JSON.parse(JSON.stringify(productDetails));

        // Убеждаемся, что есть хотя бы один размер
        if (!editableProduct.sizes || editableProduct.sizes.length === 0) {
            editableProduct.sizes = [{
                techSize: "0",
                wbSize: "",
                skus: editableProduct.barcode ? [editableProduct.barcode] : [],
                price: editableProduct.price || 0
            }];
        }

        // Убеждаемся, что все размеры имеют techSize
        editableProduct.sizes = editableProduct.sizes.map(size => ({
            ...size,
            techSize: size.techSize || "0",
            skus: Array.isArray(size.skus) ? size.skus : []
        }));

        // Убеждаемся, что все характеристики имеют значения в виде массивов
        if (editableProduct.characteristics) {
            editableProduct.characteristics = editableProduct.characteristics.map(char => ({
                ...char,
                value: Array.isArray(char.value) ? char.value : (char.value ? [char.value] : []),
                popular: char.popular || false
            }));
        }

        setEditedProduct(editableProduct);
        setIsEditMode(true);
    }
};

const loadMoreProducts = async () => {
    if (!hasMoreProducts || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
        const result = await fetchWBProductsWithPagination(productsCursor, searchQuery, true, searchFilters, pageSize);

        if (result.products.length > 0) {
            setProducts(prevProducts => [...prevProducts, ...result.products]);
            setProductsCursor(result.cursor);
            setHasMoreProducts(result.hasMore);
        }
    } catch (error) {
        console.error('Ошибка загрузки дополнительных товаров:', error);
        logApiError(error, 'Wildberries');
    } finally {
        setIsLoadingMore(false);
    }
};

export default MarketplaceManagementSystem;