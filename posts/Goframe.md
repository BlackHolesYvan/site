# GoFrame 框架使用心得

本文整理自日常开发中的 GoFrame 实践笔记，涵盖项目初始化、工程结构约定，以及 Redis、JWT、常用工具函数和 SQL 辅助方法等代码实现。示例代码均来自真实项目，按主题归类，方便查阅与复用。

## 快速开始

### 如何快速初始化项目

使用官方脚手架 gf 初始化项目，并可直接以 gRPC 模式启动。

```shell
cd my-project
gf init .
gf run main.go --args "grpc"
```

### 代码生成

gf gen 系列命令覆盖控制器、DAO、Service 与 protobuf 的代码生成，是日常开发中使用频率最高的工具链。

```shell
gf gen ctrl # /api --> /internal/controller
gf gen dao # /hack --> /internal/model | /internal/dao
gf gen service # /internal/logic --> /internal/service
gf gen pb -o ./api/v1 # /manifest/protobuf --> /api/v1
```

### 驱动的安装与引入

MySQL 与 Redis 驱动通过匿名导入注册，注意放在 main.go 的 import 中。

```go
// 在 main.go 中引用
_ "github.com/gogf/gf/contrib/drivers/mysql/v2"
_ "github.com/gogf/gf/contrib/nosql/redis/v2"
```

## 工程结构

### 单仓模式

单仓适合中小型项目：API 定义、内部逻辑、发布配置集中在一个仓库内，边界清晰。

```text
--api // api定义层
--common // 公共定义层
--grpc // grpc驱动层
--hack // 数据库结构配置
--internal // 内部逻辑层
----cmd // 服务层
----consts // 常量定义
----controller // 控制器
----dao
----logic // 逻辑层
----model // 模型层
----route // 路由层
----service // 服务层
--logs // 日志层
--manifest // 发布层
----config // 配置
----sql  // 发布sql变更
--resource // 资源层
--utility // 公共工具包层
Dockerfile
Dockerfile-dev
go.mod
go.sum
main.go
README.MD
```

### 多仓模式

多仓适合多应用共享公共代码的场景，common 与 utility 独立沉淀，应用按 app 拆分。

```text
--app
----app1
----app2
--common
--hack
--internal
----consts
----dao
----logic
----model
----pkg // 公共服务层
--sql
--utility
Dockerfile
Dockerfile-dev
go.mod
go.sum
README.MD
```

### 逻辑层标准结构

一套约定俗成的 logic 层方法签名，统一 CRUD、搜索与关联查询的入口，便于团队协作。

```text
--NEW()
--List(ctx context.Context, page model.List, search model.Search) (list []any, total int, err error)
--Detail(ctx context.Context, id int)
--Create(context.Context, input model.Input) (err error)
--Update(context.Context, input model.Input) (err error)
--OnlyUpdate(context.Context, id int, data g.Map)  (err error)
--Delete(context.Context, id int) (err error)
--search(ctx context.Context, search model.Search) func(m *gdb.Model) *gdb.Model
--RelationSearch(ctx context.Context, search model.Search, sql string) (relation *gdb.Model, count int)
```

## 常用代码实现

### Redis 客户端封装

统一前缀、过期时间与常用命令封装，业务代码只关心 key 与 value。

```go
package redis

import (
	"context"
	"time"

	"github.com/gogf/gf/v2/container/gvar"
	"github.com/gogf/gf/v2/database/gredis"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/os/gctx"
)

type uRedis struct {
	Prefix string
	Redis  *gredis.Redis
}

var RedisPrefix = GetPrefix(gctx.New())

func New() *uRedis {
	return &uRedis{
		// Prefix: GetPrefix(gctx.New()) + ":", // 自动维护前缀
		Prefix: RedisPrefix + ":", // 统一维护前缀
		Redis:  g.Redis(),
	}
}

// 获取前缀
func GetPrefix(ctx context.Context) (prefix string) {
	prefix = g.Cfg().MustGet(ctx, "redis.default.prefix").String()
	if g.IsEmpty(prefix) {
		prefix = g.Cfg().MustGet(ctx, "grpc.serverName").String()
		if g.IsEmpty(prefix) {
			prefix = g.Cfg().MustGet(ctx, "server.serverName").String()
		}
	}
	return
}

func (u *uRedis) Set(ctx context.Context, key string, value interface{}, expire int64) (reply *gvar.Var, err error) {
	key = u.Prefix + key
	if expire == 0 {
		expire = g.Cfg().MustGet(ctx, "redis.default.expire").Int64()
	}
	if expire <= 0 {
		reply, err = u.Redis.Set(ctx, key, value)
	} else {
		err = u.Redis.SetEX(ctx, key, value, expire)
	}
	return
}

func (u *uRedis) Get(ctx context.Context, key string) (reply *gvar.Var, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.Get(ctx, key)
	return
}

func (u *uRedis) IncrBy(ctx context.Context, key string, increment int64) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.IncrBy(ctx, key, increment)
	return
}

func (u *uRedis) DecrBy(ctx context.Context, key string, increment int64) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.DecrBy(ctx, key, increment)
	return
}

func (u *uRedis) HGetAll(ctx context.Context, key string) (reply *gvar.Var, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HGetAll(ctx, key)
	return
}

func (u *uRedis) HSet(ctx context.Context, key string, fields map[string]interface{}) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HSet(ctx, key, fields)
	return
}

func (u *uRedis) HGet(ctx context.Context, key string, field string) (reply *gvar.Var, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HGet(ctx, key, field)
	return
}

func (u *uRedis) HDel(ctx context.Context, key string, fields ...string) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HDel(ctx, key, fields...)
	return
}

func (u *uRedis) HMSet(ctx context.Context, key string, fields map[string]interface{}) (err error) {
	key = u.Prefix + key
	err = u.Redis.HMSet(ctx, key, fields)
	return
}

func (u *uRedis) HExists(ctx context.Context, key string, fields string) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HExists(ctx, key, fields)
	return
}

func (u *uRedis) HCopy(ctx context.Context, key string, newKey string) (reply int64, err error) {
	key = u.Prefix + key
	newKey = u.Prefix + newKey
	// _, err = u.Redis.Copy(ctx, key, newKey) // redis 6.2+ 版本支持
	var value *gvar.Var
	if value, err = u.Redis.HGetAll(ctx, key); err != nil {
		return
	}
	if !value.IsEmpty() {
		if err = u.Redis.HMSet(ctx, newKey, value.Map()); err != nil {
			return
		}
		reply = 1
	}
	return
}

func (u *uRedis) ExpireAt(ctx context.Context, key string, time time.Time, option ...gredis.ExpireOption) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.ExpireAt(ctx, key, time, option...)
	return
}

func (u *uRedis) HIncrBy(ctx context.Context, key string, field string, increment int64) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.HIncrBy(ctx, key, field, increment)
	return
}

func (u *uRedis) Do(ctx context.Context, command string, args ...interface{}) (*gvar.Var, error) {
	return u.Redis.Do(ctx, command, args...)
}

func (u *uRedis) SetPrefix(prefix string) *uRedis {
	u.Prefix = prefix
	return u
}

func (u *uRedis) Del(ctx context.Context, key string) (reply int64, err error) {
	key = u.Prefix + key
	reply, err = u.Redis.Del(ctx, key)
	return
}

func (u *uRedis) SetNX(ctx context.Context, key string, value any, expire int64) (reply bool, err error) {
	key = u.Prefix + key
	if expire <= 0 {
		reply, err = u.Redis.SetNX(ctx, key, value)
	} else {
		var temp *gvar.Var
		temp, err = u.Redis.Set(ctx, key, value, gredis.SetOption{
			NX: true,
			TTLOption: gredis.TTLOption{
				PX: &expire,
			},
		})
		reply = temp.Bool()
	}
	return
}
```

### JWT 令牌实现

令牌的签发、校验、刷新与销毁四个环节，配合配置化的多应用密钥与单点登录策略。

```yaml
JwtCenter:
  app1:
    Secret: 7pmRHwbmaGbowwd6hSBqRIUeEq4YYxeM
    IsSingle: true
    TTL: 86400
    RefreshTTL: 1440
  app2:
    Secret: 7pmRHwbmaGbowwd6hSBq45IUeEqYYxeM
    IsSingle: true
    TTL: 604800
    RefreshTTL: 604800
  app3:
    Secret: 7pmjHwbmaGbowwd7hSBq45IUeEqYYxeM
    IsSingle: false
    TTL: 604800
    RefreshTTL: 604800
```

```go
package logic

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"center/common"
	"center/common/jwttoken"
	"center/service/hr/model"
	"center/service/hr/rpc/hr"
	"center/service/hr/rpc/internal/svc"

	"github.com/Masterminds/squirrel"
	"github.com/golang-jwt/jwt/v4"
	"github.com/zeromicro/go-zero/core/logx"
)

type ApplyJwtTokenLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewApplyJwtTokenLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ApplyJwtTokenLogic {
	return &ApplyJwtTokenLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// 统一token接口
func (l *ApplyJwtTokenLogic) ApplyJwtToken(in *hr.ApplyJwtTokenReq) (*hr.JwtTokenReply, error) {
	if err := l.validate(in); err != nil {
		return nil, err
	}

	var (
		err     error
		aud     = jwttoken.GetAud(in.Slug, in.Role)
		nowTime = time.Now()
		jti     int64
		last    *model.JwtTokenLogs
		token   string
	)

	// 检验系统标识
	if l.svcCtx.Config.JwtCenter[in.Slug] == nil {
		return nil, common.NewCodeError(http.StatusUnprocessableEntity, "系统标识不存在")
	}
	jwtConfig := *l.svcCtx.Config.JwtCenter[in.Slug]
	if len(jwtConfig.Roles) > 0 && jwtConfig.Roles[in.Role] != nil {
		jwtConfig.IsSingle = jwtConfig.Roles[in.Role].IsSingle
		jwtConfig.TTL = jwtConfig.Roles[in.Role].TTL
		jwtConfig.RefreshTTL = jwtConfig.Roles[in.Role].RefreshTTL
	}
	// 特殊处理admin, 固定不开启单点登录
	if in.Sub == "admin" {
		jwtConfig.IsSingle = false
	}
	exp := nowTime.Add(time.Minute * time.Duration(jwtConfig.TTL))

	// 单点登录时 获取上次token
	if jwtConfig.IsSingle {
		query := l.svcCtx.JwtTokenLogsModel.RowBuilder().Where(squirrel.Eq{
			"sub":    in.Sub,
			"aud":    aud,
			"status": 1,
		}).Where("exp > ?", nowTime.Format(common.DateFormat)).OrderBy("jti DESC").Limit(1)
		last, _ = l.svcCtx.JwtTokenLogsModel.FindOneByQuery(l.ctx, query)
	}

	// 新增jwt token 记录
	if result, errI := l.svcCtx.JwtTokenLogsModel.Insert(l.ctx, &model.JwtTokenLogs{
		Iat:       nowTime,
		Exp:       exp,
		Nbf:       nowTime,
		Sub:       in.Sub,
		Iss:       in.Iss,
		Aud:       aud,
		Status:    1,
		CreatedAt: sql.NullTime{Time: nowTime, Valid: true},
		UpdatedAt: sql.NullTime{Time: nowTime, Valid: true},
	}); errI != nil {
		return nil, errI
	} else {
		jti, errI = result.LastInsertId()
		if errI != nil || jti == 0 {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "获取JWT ID失败")
		}
	}

	// 失效上次token
	if last != nil {
		// last.Status = 5
		// last.UpdatedAt = sql.NullTime{Time: nowTime, Valid: true}
		// if err = l.svcCtx.JwtTokenLogsModel.Update(l.ctx, last); err != nil {
		// 	return nil, err
		// }
		if _, err = l.svcCtx.SqlConn.ExecCtx(l.ctx, "update jwt_token_logs set status = ?, updated_at = ? where jti = ? and status = 1", 5, nowTime.Format(common.DateFormat), last.Jti); err != nil {
			return nil, err
		}
		jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, int64(last.Jti), last.Exp.Unix(), 5)
	}

	token, err = jwttoken.GenerateJwtToken(jwt.MapClaims{
		"iss": in.Iss,         // 签发者
		"iat": nowTime.Unix(), // 签发时间
		"exp": exp.Unix(),     // 过期时间
		"nbf": nowTime.Unix(),
		"jti": jti,
		"sub": in.Sub, // 主题
		"aud": aud,
	}, jwtConfig.Secret)

	return &hr.JwtTokenReply{
		Status: 1,
		Token:  token,
		Sub:    in.Sub,
		Exp:    exp.Unix(),
	}, err
}

// 验证器
func (l *ApplyJwtTokenLogic) validate(in *hr.ApplyJwtTokenReq) error {
	// 参数验证
	v := common.NewValidate()
	if err := v.ValidatorByRulesTrans(in, map[string]string{
		"Slug": "required",
		"Sub":  "required",
	}, map[string]string{
		"Slug": "系统标识",
		"Sub":  "主题",
	}, hr.ApplyJwtTokenReq{}); err != nil {
		return common.NewCodeError(http.StatusUnprocessableEntity, fmt.Sprintf("参数错误：:%v", err))
	}
	return nil
}

```

```go
package logic

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"center/common"
	"center/common/jwttoken"
	"center/service/hr/model"
	"center/service/hr/rpc/hr"
	"center/service/hr/rpc/internal/svc"

	"github.com/Masterminds/squirrel"
	"github.com/golang-jwt/jwt/v4"
	"github.com/zeromicro/go-zero/core/logx"
)

type CertifyJwtTokenLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

var locker = struct {
	mu    sync.Mutex
	data  map[int64]interface{}
	count int
}{data: make(map[int64]interface{}, 0)}

func NewCertifyJwtTokenLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CertifyJwtTokenLogic {
	return &CertifyJwtTokenLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// 认证 jwt token
func (l *CertifyJwtTokenLogic) CertifyJwtToken(in *hr.CertifyJwtTokenReq) (*hr.JwtTokenReply, error) {
	if err := l.validate(in); err != nil {
		return nil, err
	}

	var (
		claims  jwt.MapClaims
		status  int64
		token   string
		nowTime = time.Now()
		sub     string
		exp     int64
		err     error
	)

	// 检验系统标识
	if l.svcCtx.Config.JwtCenter[in.Slug] == nil {
		return nil, common.NewCodeError(http.StatusUnprocessableEntity, "系统标识不存在")
	}
	jwtConfig := *l.svcCtx.Config.JwtCenter[in.Slug]
	if len(jwtConfig.Roles) > 0 && jwtConfig.Roles[in.Role] != nil {
		jwtConfig.IsSingle = jwtConfig.Roles[in.Role].IsSingle
		jwtConfig.TTL = jwtConfig.Roles[in.Role].TTL
		jwtConfig.RefreshTTL = jwtConfig.Roles[in.Role].RefreshTTL
	}

	claims, status = jwttoken.ValidateJwtToken(in.Token, jwtConfig.Secret)

	if claims == nil {
		return &hr.JwtTokenReply{Status: 0}, nil
	}

	sub, _ = claims["sub"].(string)
	if sub == "" {
		subNumber, _ := claims["sub"].(json.Number)
		if subNumber == "" {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常4")
		} else {
			sub = subNumber.String()
		}
	}
	// 特殊处理admin, 固定不开启单点登录
	if sub == "admin" {
		jwtConfig.IsSingle = false
	}

	if val, ok := claims["exp"].(json.Number); ok {
		if exp, err = val.Int64(); err != nil {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常2")
		}
	}

	if claims["jti"] != nil && claims["aud"] != nil {
		var (
			jti int64
			aud string
			iss string
		)

		// 获取token参数
		if val, ok := claims["jti"].(json.Number); ok {
			if jti, err = val.Int64(); err != nil {
				return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常1")
			}
		}
		aud, _ = claims["aud"].(string)
		if aud == "" {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常3")
		}
		iss, _ = claims["iss"].(string)
		if iss == "" {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常5")
		}

		// 校验身份
		if status == 1 {
			status = 0
			if aud == jwttoken.GetAud(in.Slug, in.Role) {
				status = 1
			}
		}

		if status == 0 {
			// token 异常
			l.svcCtx.SqlConn.ExecCtx(l.ctx, "update jwt_token_logs set warning = ?, warning_at = ? where jti = ? and warning is null", 1, time.Now().Format(common.DateFormat), claims["jti"])
		} else {
			// 黑名单校验
			if checkStatus := jwttoken.IsInvalidateJwtToken(l.svcCtx.RedisClient, jti); checkStatus != nil {
				status = *checkStatus
			}
		}

		// token刷新
		if status == 2 {
			if (jwtConfig.RefreshTTL*60)+exp > nowTime.Unix() {
				status = 0

				// 获取内存锁
				mu := l.getMu(jti)
				mu.Lock()
				defer mu.Unlock()

				// 设定刷新token允许间隔时间(5秒)
				refreshTokenIntervalTime := 10 * time.Second
				// 设定刷新token黑名单过期时间
				refreshTokenBlackTime := nowTime.Add(time.Minute * time.Duration(jwtConfig.TTL) / 2).Unix()
				// 判断是否在黑名单中，在的话直接返回
				if checkStatus := jwttoken.IsInvalidateJwtToken(l.svcCtx.RedisClient, jti); checkStatus != nil {
					return &hr.JwtTokenReply{Status: *checkStatus}, nil
				}
				var refreshToken string
				// 查询是否在刷新列表中
				if refreshToken, err = l.svcCtx.RedisClient.Get(fmt.Sprintf("jwt_token_refresh_list:%d", jti)); err != nil {
					logx.Errorf("获取刷新token异常：%v", err)
				}
				if refreshToken != "" {
					return &hr.JwtTokenReply{
						Status: 3,
						Token:  refreshToken,
						Sub:    sub,
						Exp:    nowTime.Add(time.Minute*time.Duration(jwtConfig.TTL) - refreshTokenIntervalTime).Unix(),
					}, nil
				}

				// 查询数据库记录，判定当前jti有效性
				var log *model.JwtTokenLogs
				if jwtConfig.IsSingle {
					// 获取最新一条记录
					whereBuilder := l.svcCtx.JwtTokenLogsModel.RowBuilder().Where(squirrel.Eq{
						"sub": sub,
						"aud": aud,
					}).OrderBy("jti desc")
					if log, err = l.svcCtx.JwtTokenLogsModel.FindOneByQuery(l.ctx, whereBuilder); err != nil {
						logx.Errorf("获取token日志异常：%v", err)
						jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, jti, refreshTokenBlackTime, 0)
						return &hr.JwtTokenReply{Status: status}, nil
					}
					if int64(log.Jti) != jti || log.Status != 1 {
						jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, jti, refreshTokenBlackTime, 0)
						return &hr.JwtTokenReply{Status: status}, nil
					}
				} else {
					// 获取当前记录
					if log, err = l.svcCtx.JwtTokenLogsModel.FindOne(l.ctx, uint64(jti)); err != nil {
						logx.Errorf("获取token日志异常：%v", err)
						jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, jti, refreshTokenBlackTime, 0)
						return &hr.JwtTokenReply{Status: status}, nil
					}
					if log.Status != 1 {
						jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, jti, refreshTokenBlackTime, 0)
						return &hr.JwtTokenReply{Status: status}, nil
					}
				}

				var (
					result sql.Result
					newJti int64
				)
				if result, err = l.svcCtx.JwtTokenLogsModel.Insert(l.ctx, &model.JwtTokenLogs{
					Iat:       nowTime,
					Exp:       nowTime.Add(time.Minute * time.Duration(jwtConfig.TTL)),
					Nbf:       nowTime,
					Sub:       sub,
					Iss:       iss,
					Aud:       aud,
					Status:    1,
					CreatedAt: sql.NullTime{Time: nowTime, Valid: true},
					UpdatedAt: sql.NullTime{Time: nowTime, Valid: true},
				}); err != nil {
					logx.Errorf("新增token日志异常：%v", err)
					return &hr.JwtTokenReply{Status: status}, nil
				} else {
					if newJti, err = result.LastInsertId(); err != nil || newJti == 0 {
						logx.Errorf("新增token日志异常2：%v", err)
						return &hr.JwtTokenReply{Status: status}, nil
					}
				}
				if _, err = l.svcCtx.SqlConn.ExecCtx(l.ctx, "update jwt_token_logs set status = ?, refresh_jti = ?, updated_at = ? where jti = ? and status = 1", 3, newJti, nowTime.Format(common.DateFormat), jti); err != nil {
					logx.Errorf("更新token日志异常：%v", err)
					return &hr.JwtTokenReply{Status: status}, nil
				}

				// 生成新token
				claims["jti"] = newJti
				claims["sub"] = sub
				claims["iss"] = iss
				claims["aud"] = aud
				claims["iat"] = nowTime.Unix()
				claims["exp"] = nowTime.Add(time.Minute * time.Duration(jwtConfig.TTL)).Unix()
				claims["nbf"] = nowTime.Unix()
				if token, err = jwttoken.GenerateJwtToken(claims, jwtConfig.Secret); err != nil {
					logx.Errorf("刷新token异常：%v", err)
				}

				// 新token加入刷新列表
				if err = l.svcCtx.RedisClient.Set(fmt.Sprintf("jwt_token_refresh_list:%d", jti), token, int(refreshTokenIntervalTime/time.Second)); err != nil {
					logx.Errorf("设置刷新token异常：%v", err)
				}

				return &hr.JwtTokenReply{
					Status: 3,
					Token:  token,
					Sub:    sub,
					Exp:    nowTime.Add(time.Minute * time.Duration(jwtConfig.TTL)).Unix(),
				}, nil
			}
		}
	} else {
		// 旧token统一处理为过期
		status = 2
	}

	return &hr.JwtTokenReply{
		Status: status,
		Sub:    sub,
		Exp:    exp,
	}, nil
}

// 验证器
func (l *CertifyJwtTokenLogic) validate(in *hr.CertifyJwtTokenReq) error {
	// 参数验证
	v := common.NewValidate()
	if err := v.ValidatorByRulesTrans(in, map[string]string{
		"Slug":  "required",
		"Token": "required",
	}, map[string]string{
		"Slug":  "系统标识",
		"Token": "token",
	}, hr.CertifyJwtTokenReq{}); err != nil {
		return common.NewCodeError(http.StatusUnprocessableEntity, fmt.Sprintf("参数错误：:%v", err))
	}
	return nil
}

func (l *CertifyJwtTokenLogic) getMu(jti int64) (mu *sync.Mutex) {
	locker.mu.Lock()
	defer locker.mu.Unlock()
	if locker.data[jti] == nil {
		if locker.count > 10000 {
			locker.data = nil
			locker.data = make(map[int64]interface{}, 0)
			locker.count = 0
		}
		mu = &sync.Mutex{}
		locker.data[jti] = mu
		locker.count++
	} else {
		mu, _ = locker.data[jti].(*sync.Mutex)
	}
	return
}

func (l *CertifyJwtTokenLogic) claimToString(any interface{}) string {
	if any == nil {
		return ""
	}
	switch value := any.(type) {
	case int:
		return fmt.Sprintf("%d", value)
	case int8:
		return fmt.Sprintf("%d", value)
	case int16:
		return fmt.Sprintf("%d", value)
	case int32:
		return fmt.Sprintf("%d", value)
	case int64:
		return fmt.Sprintf("%d", value)
	case uint:
		return fmt.Sprintf("%d", value)
	case uint8:
		return fmt.Sprintf("%d", value)
	case uint16:
		return fmt.Sprintf("%d", value)
	case uint32:
		return fmt.Sprintf("%d", value)
	case uint64:
		return fmt.Sprintf("%d", value)
	case string:
		return value
	case []byte:
		return string(value)
	case json.Number:
		return value.String()
	default:
		return ""
	}
}

```

```go
package logic

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"center/common"
	"center/common/jwttoken"
	"center/service/hr/rpc/hr"
	"center/service/hr/rpc/internal/svc"

	"github.com/golang-jwt/jwt/v4"
	"github.com/zeromicro/go-zero/core/logx"
)

type DestroyJwtTokenLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewDestroyJwtTokenLogic(ctx context.Context, svcCtx *svc.ServiceContext) *DestroyJwtTokenLogic {
	return &DestroyJwtTokenLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// 销毁 jwt token
func (l *DestroyJwtTokenLogic) DestroyJwtToken(in *hr.DestroyJwtTokenReq) (*hr.JwtTokenReply, error) {
	if err := l.validate(in); err != nil {
		return nil, err
	}

	var (
		claims  jwt.MapClaims
		status  int64
		nowTime = time.Now()
		exp     int64
		err     error
	)

	// 检验系统标识
	if l.svcCtx.Config.JwtCenter[in.Slug] == nil {
		return nil, common.NewCodeError(http.StatusUnprocessableEntity, "系统标识不存在")
	}
	jwtConfig := *l.svcCtx.Config.JwtCenter[in.Slug]
	if len(jwtConfig.Roles) > 0 && jwtConfig.Roles[in.Role] != nil {
		jwtConfig.IsSingle = jwtConfig.Roles[in.Role].IsSingle
		jwtConfig.TTL = jwtConfig.Roles[in.Role].TTL
		jwtConfig.RefreshTTL = jwtConfig.Roles[in.Role].RefreshTTL
	}

	claims, status = jwttoken.ValidateJwtToken(in.Token, jwtConfig.Secret)

	if claims == nil {
		return &hr.JwtTokenReply{Status: 0}, nil
	}

	if val, ok := claims["exp"].(json.Number); ok {
		if exp, err = val.Int64(); err != nil {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常2")
		}
	}

	if claims["jti"] != nil && claims["aud"] != nil {
		var (
			jti int64
			aud string
		)

		// 获取token参数
		if val, ok := claims["jti"].(json.Number); ok {
			if jti, err = val.Int64(); err != nil {
				return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常1")
			}
		}
		aud, _ = claims["aud"].(string)
		if aud == "" {
			return nil, common.NewCodeError(http.StatusUnprocessableEntity, "token参数异常3")
		}

		// 校验身份
		if status == 1 {
			status = 0
			if aud == jwttoken.GetAud(in.Slug, in.Role) {
				status = 1
			}
		}

		if status == 0 {
			// token 异常
			l.svcCtx.SqlConn.ExecCtx(l.ctx, "update jwt_token_logs set warning = ?, warning_at = ? where jti = ? and warning is null", 1, time.Now().Format(common.DateFormat), claims["jti"])
		} else {
			// 黑名单校验
			if checkStatus := jwttoken.IsInvalidateJwtToken(l.svcCtx.RedisClient, jti); checkStatus != nil {
				status = *checkStatus
			}
		}

		if status == 1 {
			status = 4
			if _, err = l.svcCtx.SqlConn.ExecCtx(l.ctx, "update jwt_token_logs set status = ?, updated_at = ? where jti = ? and status = 1", 5, nowTime.Format(common.DateFormat), jti); err != nil {
				return nil, err
			}
			jwttoken.InvalidateJwtToken(l.svcCtx.RedisClient, jti, exp, 4)
		}
	}

	return &hr.JwtTokenReply{
		Status: status,
	}, nil
}

// 验证器
func (l *DestroyJwtTokenLogic) validate(in *hr.DestroyJwtTokenReq) error {
	// 参数验证
	v := common.NewValidate()
	if err := v.ValidatorByRulesTrans(in, map[string]string{
		"Slug":  "required",
		"Token": "required",
	}, map[string]string{
		"Slug":  "系统标识",
		"Token": "token",
	}, hr.DestroyJwtTokenReq{}); err != nil {
		return common.NewCodeError(http.StatusUnprocessableEntity, fmt.Sprintf("参数错误：:%v", err))
	}
	return nil
}

```

### HTML 转义工具

将 Unicode 转义序列还原为可读字符，常用于处理外部接口返回的转义文本。

```go
// 替换转义字符中的双反斜杠为单反斜杠（例如 \\u4E16 → \u4E16）
func UnescapeUnicode(raw string) (string, error) {
	// 替换转义字符中的双反斜杠为单反斜杠（例如 \\u4E16 → \u4E16）
	quoted := strconv.Quote(raw)
	quoted = strings.ReplaceAll(quoted, `\\u`, `\u`)
	unquoted, err := strconv.Unquote(quoted)
	if err != nil {
		return "", err
	}
	return unquoted, nil
}
```

### 命令行进度条

批量任务执行时输出进度条，适合数据迁移、导入等耗时脚本。

```go
func ProgressBar(ctx context.Context, count int, chunk int, f func(ctx context.Context, page int, chunk int) (msg string, err error)) (err error) {
	pages := int(math.Ceil(float64(count) / float64(chunk)))
	progress := 0
	msg := ""
	for page := 1; page <= pages; page++ {
		progress = (page * 100) / pages
		if msg, err = f(ctx, page-1, chunk); err != nil {
			return
		}
		fmt.Printf("\rProgress: [%-50s] %d%%", strings.Repeat("=", progress/2), progress)
		if msg != "" {
			fmt.Printf("   %s", msg)
		}
	}
	return
}
```

### 微信号脱敏

保留首尾字符、中间用星号替代，用于列表展示等低敏感场景。

```go
func HiddenWechatID(wechatID string) (HiddenWechatID string) {
	HiddenWechatID = ""
	length := gstr.LenRune(wechatID)
	if length <= 0 {
		return
	}
	if length <= 2 {
		HiddenWechatID = gstr.SubStrRune(wechatID, 0, 1) + gstr.Repeat("*", 2) + gstr.SubStrRune(wechatID, length-1, 1)
		return
	}
	num := length
	if length > 6 {
		num = 6
	}
	HiddenWechatID = gstr.SubStrRune(wechatID, 0, 1) + gstr.Repeat("*", num-2) + gstr.SubStrRune(wechatID, length-1, 1)
	return
}
```

### 手机号脱敏

保留前三位与后四位，是列表接口中最常见的脱敏方式。

```go
func HiddenPhone(phone string) (hidden_phone string) {
	if phone == "" {
		return
	}
	hidden_phone = fmt.Sprintf("%s****%s", gstr.SubStr(phone, 0, 3), gstr.SubStr(phone, 7))
	return
}
```

### 高精度四舍五入

借助 decimal 库避免浮点误差，返回放大后的整数，适合金额与费率计算。

```go
import "github.com/shopspring/decimal"

// RoundDecimal 将浮点数按指定小数位进行四舍五入，并返回放大后的整数值
// 功能：使用decimal库进行高精度四舍五入计算，避免浮点数精度丢失问题
// 参数:
//   - value float64: 待处理的浮点数
//   - number int: 保留的小数位数
//
// 返回值:
//   - int64: 将浮点数乘以10^number后四舍五入得到的整数值
//
// 示例:
//   - RoundDecimal(3.1415, 2) // 返回 314
//   - RoundDecimal(123.4567, 3) // 返回 123457
func RoundDecimal(value float64, number int) int64 {
	multiple := math.Pow10(number)
	result := decimal.NewFromFloat(value)
	result = result.Mul(decimal.NewFromFloat(multiple))
	result = result.Round(0)
	return result.IntPart()
}
```

### 计算相隔整月数

按自然月计算两个时间点的间隔并四舍五入，适用于账期、订阅周期等场景。

```go
// RoundMonths 计算两个时间之间的月数，四舍五入到最近的整月
// 参数:
//   - start *gtime.Time: 开始时间
//   - end *gtime.Time: 结束时间
//
// 返回值:
//   - int: 月数，四舍五入到最近的整月
func RoundMonths(start *gtime.Time, end *gtime.Time) int {
	// 确保 start <= end，若需要可交换并记录符号
	if start.After(end) {
		return -RoundMonths(end, start)
	}

	// 先找到不超过 end 的最大整月数
	months := 0
	candidate := start
	for {
		next := candidate.AddDate(0, 1, 0)
		if next.After(end) {
			break
		}
		candidate = next
		months++
	}

	// 计算剩余天数
	daysRemaining := end.Sub(candidate).Hours() / 24

	// 计算当前月（candidate所在月）的总天数
	year, month, _ := candidate.Date()
	location := candidate.Location()
	firstOfNextMonth := time.Date(year, month+1, 1, 0, 0, 0, 0, location)
	lastOfThisMonth := firstOfNextMonth.Add(-time.Nanosecond)
	totalDaysInMonth := lastOfThisMonth.Day() // 28~31

	// 四舍五入：剩余天数 >= 当月一半则进一个月
	if daysRemaining >= float64(totalDaysInMonth)/2.0 {
		months++
	}
	return months
}
```

### 泛型三目运算

Go 没有内置三目运算符，这里用泛型函数补足，注意指针参数需要自行判空。

```go
// Ternary 泛型三目运算函数 (参数为指针时需注意是否为 nil)
func T[T any](condition bool, trueVal, falseVal T) T {
	if condition {
		return trueVal
	}
	return falseVal
}
```

### SQL 手机号模糊查询

把带星号的脱敏手机号转换为 SQL LIKE 条件，兼顾脱敏展示与后台检索。

```go
func PhoneSqlFormat(ctx context.Context, phone string, field string) string {
	len := len(phone)
	if len >= 4 {
		phone = gstr.SubStr(phone, 0, 11)
		// 匹配11位
		if len >= 11 {
			if gstr.PosI(phone, "*") >= 3 && gstr.PosI(phone, "*") <= 6 {
				return field + " like '" + gstr.Replace(phone, "*", "_") + "'"
			}
		} else {
			return field + " like '" + gstr.SubStr("___________", 0, 11-len) + phone + "'"
		}
	}
	return field + " = '" + phone + "'"
}
```

### SQL 字符串条件格式化

按 like、左右模糊、手机号等选项统一格式化查询参数。

```go
func FormatString(ctx context.Context, str *string, option string) interface{} {
	if str != nil && !g.IsEmpty(*str) {
		switch option {
		case "like":
			*str = "%" + *str + "%"
		case "left":
			*str = *str + "%"
		case "right":
			*str = "%" + *str
		case "phone":
			length := len(*str)
			if length >= 4 {
				*str = gstr.SubStr(*str, 0, 11)
				if length >= 11 && gstr.Pos(*str, "*") >= 3 && gstr.PosR(*str, "*") <= 6 {
					*str = gstr.SubStr(*str, 0, 3) + "____" + gstr.SubStr(*str, 7, 11)
				} else {
					*str = gstr.SubStr("___________", 0, 11-length) + *str
				}
			} else {
				*str = "%" + *str + "%"
			}
		}
		return str
	}
	return nil
}
```

### SQL 日期区间格式化

将日期区间补齐为当天的开始与结束时间，避免漏掉边界数据。

```go
func FormatDate(ctx context.Context, time *g.Slice) *g.Slice {
	if time != nil && len(*time) >= 2 {
		if (*time)[0] == "" || (*time)[1] == "" {
			return nil
		}
		start := gtime.New((*time)[0])
		end := gtime.New((*time)[1])
		if gtime.New((*time)[0]).StartOfDay().Equal(start) {
			(*time)[0] = start.String()
		}
		if gtime.New((*time)[1]).StartOfDay().Equal(end) {
			(*time)[1] = end.EndOfDay().String()
		} else {
			(*time)[1] = end.String()
		}
		if len(*time) > 2 {
			*time = (*time)[:2]
		}
		return time
	} else {
		return nil
	}
}
```

### SQL 区间参数格式化

处理 between 类查询的左右边界，自动纠正大小顺序并兼容空值。

```go
func FormatSlice(ctx context.Context, param *g.Slice, option string) interface{} {
	if param != nil && len(*param) > 0 {
		switch option {
		case "betweenLeftInt":
			if g.IsEmpty(gconv.String((*param)[0])) {
				return nil
			}
			if len(*param) >= 2 {
				if !g.IsEmpty(gconv.String((*param)[1])) {
					*param = (*param)[:2]
					if gconv.Int((*param)[0]) > gconv.Int((*param)[1]) {
						(*param)[0], (*param)[1] = (*param)[1], (*param)[0]
					}
				}
				return (*param)[0]
			} else {
				return (*param)[0]
			}
		case "betweenRightInt":
			if len(*param) >= 2 {
				if g.IsEmpty(gconv.String((*param)[1])) {
					return nil
				}
				if !g.IsEmpty(gconv.String((*param)[0])) {
					*param = (*param)[:2]
					if gconv.Int((*param)[0]) > gconv.Int((*param)[1]) {
						(*param)[0], (*param)[1] = (*param)[1], (*param)[0]
					}
				}
				return (*param)[1]
			}
		case "between":
			if len(*param) >= 2 {
				*param = (*param)[:2]
				return param
			}
		default:
			if !g.IsEmpty((*param)[0]) {
				return param
			}
		}
	}
	return nil
}
```

### 列表字段提取

批量提取列表中的某个字段并去重、过滤空值，减少业务层的样板代码。

```go
func ListItemValues(list any, key string, subKey ...any) (result []any) {
	if len(subKey) > 100 {
		for _, v := range gdb.ListItemValuesUnique(list, key, subKey...) {
			if !g.IsNil(v) {
				result = append(result, v)
			}
		}
	} else {
		for _, v := range gdb.ListItemValues(list, key, subKey...) {
			if !g.IsNil(v) {
				result = append(result, v)
			}
		}
	}
	return
}
```

### 关联数据绑定

通过反射把关联数据按主键绑定到结构体字段，避免 N+1 查询。

```go
// WithList 将数据与结构体字段关联绑定
// 功能：将 data 中的元素按 dataKey 字段值建立索引，再根据 pointerKey 字段把对应数据绑定到 pointer 的 field 字段上
// 参数：
//   - pointer    any     待绑定的结构体或结构体切片指针，不能为 nil
//   - field      string  pointer 中用于存放关联数据的字段名
//   - data       []any   提供关联数据的切片，长度必须 > 0
//   - pointerKey string  pointer 中用于匹配的主键字段名
//   - dataKey    string  data 中用于匹配的主键字段名
//
// 返回值：
//   - error 成功返回 nil，参数非法或反射失败返回对应的 gerror
//
// 说明：
//   - pointer 可以是单个结构体指针，也可以是结构体切片/数组指针
//   - 当 pointer 为切片时，会逐个元素进行绑定
//   - 通过反射机制实现数据绑定，要求结构体字段可寻址
func WithList(pointer any, field string, data []any, pointerKey string, dataKey string) (err error) {
	if len(data) <= 0 {
		return
	}

	// 参数验证
	if pointer == nil || field == "" || pointerKey == "" || dataKey == "" {
		err = gerror.NewCode(gcode.CodeInvalidParameter, "参数错误")
		return
	}

	// 获取指针的反射值
	pointerVal := reflect.ValueOf(pointer)
	if pointerVal.Kind() != reflect.Ptr || pointerVal.IsNil() {
		err = gerror.NewCode(gcode.CodeInvalidParameter, "pointer must be a non-nil pointer")
		return
	}

	// 解引用获取实际值
	val := pointerVal.Elem()

	// 创建数据映射
	dataMap, err := createDataMap(data, dataKey)
	if err != nil {
		return
	}

	// 根据类型进行不同的处理
	switch val.Kind() {
	case reflect.Struct:
		// 处理单个结构体
		return bindStructData(val, field, dataMap, pointerKey)
	case reflect.Slice, reflect.Array:
		// 处理结构体数组
		// 遍历切片中的每个结构体
		for i := 0; i < val.Len(); i++ {
			structVal := val.Index(i)
			// 处理指针类型
			if structVal.Kind() == reflect.Ptr {
				if structVal.IsNil() {
					continue
				}
				structVal = structVal.Elem()
			}
			// 确保是结构体类型
			if structVal.Kind() != reflect.Struct {
				continue
			}
			if err = bindStructData(structVal, field, dataMap, pointerKey); err != nil {
				return
			}
		}
		return
	default:
		err = gerror.NewCode(gcode.CodeInvalidParameter, "pointer must be a non-nil pointer")
		return
	}
}
```

```go
package sql_tool

import (
	"errors"
	"reflect"
	"strconv"
	"strings"

	"github.com/gogf/gf/v2/util/gconv"
)

// createDataMap 根据dataKey从data数组中提取键值并创建映射
func createDataMap(data []any, dataKey string) (map[string][]any, error) {
	dataMap := make(map[string][]any)

	for _, item := range data {
		if item == nil {
			continue
		}

		// 获取dataKey对应的值作为映射的键
		key, err := getNestedFieldValue(item, dataKey)
		if err != nil {
			// 忽略无法获取键值的项，继续处理其他项
			continue
		}

		// 将数据项添加到对应的键下
		dataMap[key] = append(dataMap[key], item)
	}

	return dataMap, nil
}

// bindStructData 将数据绑定到单个结构体
func bindStructData(structVal reflect.Value, field string, dataMap map[string][]any, pointerKey string) error {
	// 获取结构体的pointerKey字段值
	keyValue, err := getNestedFieldValue(structVal.Interface(), pointerKey)
	if err != nil {
		// 如果无法获取key，忽略该结构体
		return nil
	}

	// 查找匹配的数据
	if matchedData, ok := dataMap[keyValue]; ok && len(matchedData) > 0 {
		// 检查field字段的类型
		fieldType, err := getFieldType(structVal.Interface(), field)
		if err != nil {
			return err
		}

		// 判断是否为数组或切片类型
		if fieldType.Kind() == reflect.Slice || fieldType.Kind() == reflect.Array {
			// 绑定整个数组
			return setNestedFieldValue(structVal.Addr().Interface(), field, matchedData)
		} else {
			// 非数组类型，只绑定第一个值
			return setNestedFieldValue(structVal.Addr().Interface(), field, matchedData[0])
		}
	}

	return nil
}

// getNestedFieldValue 通过嵌套路径获取字段值
func getNestedFieldValue(obj any, path string) (string, error) {
	if path == "" {
		return "", errors.New("field path cannot be empty")
	}

	// 分割路径
	parts := strings.Split(path, ".")
	val := reflect.ValueOf(obj)

	// 处理指针类型
	for val.Kind() == reflect.Ptr && !val.IsNil() {
		val = val.Elem()
	}

	// 遍历路径的每一部分
	for i, part := range parts {
		if i > 0 {
			// 再次处理指针类型
			for val.Kind() == reflect.Ptr && !val.IsNil() {
				val = val.Elem()
			}
		}

		// 根据类型获取字段值
		switch val.Kind() {
		case reflect.Struct:
			field := val.FieldByName(part)
			if !field.IsValid() {
				return "", errors.New("field not found: " + part)
			}
			val = field
		case reflect.Map:
			// 尝试使用字符串作为键
			mapKey := reflect.ValueOf(part)
			if !mapKey.Type().AssignableTo(val.Type().Key()) {
				// 如果键类型不匹配，尝试转换
				if val.Type().Key().Kind() == reflect.Int || val.Type().Key().Kind() == reflect.Int64 {
					if intKey, err := strconv.ParseInt(part, 10, 64); err == nil {
						mapKey = reflect.ValueOf(intKey)
					} else {
						return "", errors.New("invalid map key type")
					}
				} else {
					return "", errors.New("map key type mismatch")
				}
			}

			fieldVal := val.MapIndex(mapKey)
			if !fieldVal.IsValid() {
				return "", errors.New("map key not found: " + part)
			}
			val = fieldVal
		default:
			return "", errors.New("unsupported type for nested field access: " + val.Kind().String())
		}
	}

	// 再次处理指针类型，获取最终值
	for val.Kind() == reflect.Ptr && !val.IsNil() {
		val = val.Elem()
	}

	// 返回最终值
	return gconv.String(val.Interface()), nil
}

// setNestedFieldValue 通过嵌套路径设置字段值
func setNestedFieldValue(obj any, path string, value interface{}) error {
	if path == "" {
		return errors.New("field path cannot be empty")
	}

	// 获取对象的反射值
	objVal := reflect.ValueOf(obj)
	if objVal.Kind() != reflect.Ptr || objVal.IsNil() {
		return errors.New("object must be a non-nil pointer")
	}

	// 分割路径
	parts := strings.Split(path, ".")
	val := objVal.Elem()

	// 遍历路径的每一部分，除了最后一部分（我们需要设置最后一部分）
	for i := 0; i < len(parts)-1; i++ {
		part := parts[i]

		// 处理指针类型
		for val.Kind() == reflect.Ptr && !val.IsNil() {
			val = val.Elem()
		}

		// 根据类型获取下一级字段
		switch val.Kind() {
		case reflect.Struct:
			field := val.FieldByName(part)
			if !field.IsValid() {
				return errors.New("field not found: " + part)
			}
			if field.Kind() == reflect.Ptr && field.IsNil() {
				// 如果是nil指针，需要创建新实例
				fieldType := field.Type().Elem()
				newVal := reflect.New(fieldType)
				field.Set(newVal)
			}
			val = field
		case reflect.Map:
			// 尝试使用字符串作为键
			mapKey := reflect.ValueOf(part)
			if !mapKey.Type().AssignableTo(val.Type().Key()) {
				// 如果键类型不匹配，尝试转换
				if val.Type().Key().Kind() == reflect.Int || val.Type().Key().Kind() == reflect.Int64 {
					if intKey, err := strconv.ParseInt(part, 10, 64); err == nil {
						mapKey = reflect.ValueOf(intKey)
					} else {
						return errors.New("invalid map key type")
					}
				} else {
					return errors.New("map key type mismatch")
				}
			}

			fieldVal := val.MapIndex(mapKey)
			if !fieldVal.IsValid() {
				// 如果map中不存在该键，需要创建
				if !val.CanSet() {
					return errors.New("cannot set value to map")
				}

				// 确定值的类型
				var newVal reflect.Value
				if i == len(parts)-2 {
					// 最后一个中间节点，尝试根据目标值类型创建
					targetType := reflect.TypeOf(value)
					if parts[len(parts)-1] == "" || i == len(parts)-2 {
						// 如果是最后一个节点或者下一个是最后一个，创建相应类型
						newVal = reflect.New(targetType).Elem()
					} else {
						newVal = reflect.MakeMap(reflect.MapOf(mapKey.Type(), targetType))
					}
				} else {
					// 不是最后一个中间节点，创建map
					newVal = reflect.MakeMap(reflect.MapOf(reflect.TypeOf(""), reflect.TypeOf(value)))
				}
				val.SetMapIndex(mapKey, newVal)
				fieldVal = newVal
			}
			val = fieldVal
		default:
			return errors.New("unsupported type for nested field access: " + val.Kind().String())
		}
	}

	// 处理最后一个路径部分
	lastPart := parts[len(parts)-1]

	// 处理指针类型
	for val.Kind() == reflect.Ptr && !val.IsNil() {
		val = val.Elem()
	}

	// 设置最终字段的值
	switch val.Kind() {
	case reflect.Struct:
		field := val.FieldByName(lastPart)
		if !field.IsValid() {
			return errors.New("field not found: " + lastPart)
		}
		if !field.CanSet() {
			return errors.New("field cannot be set: " + lastPart)
		}

		// 转换值类型
		srcVal := reflect.ValueOf(value)
		if !srcVal.Type().AssignableTo(field.Type()) {
			if field.Kind() == reflect.Slice && (field.Type().Elem().Kind() == reflect.Struct || (field.Type().Elem().Kind() == reflect.Ptr && field.Type().Elem().Elem().Kind() == reflect.Struct)) {
				dstElemType := field.Type().Elem()
				dstSlice := reflect.MakeSlice(field.Type(), srcVal.Len(), srcVal.Len())
				for i := 0; i < srcVal.Len(); i++ {
					elem := srcVal.Index(i).Elem()
					if elem.Type().AssignableTo(dstElemType) {
						dstSlice.Index(i).Set(elem)
					} else {
						return errors.New("cannot convert value to field type1")
					}
				}
				srcVal = dstSlice
			} else {
				// 尝试转换类型
				if srcVal.CanConvert(field.Type()) {
					srcVal = srcVal.Convert(field.Type())
				} else {
					return errors.New("cannot convert value to field type")
				}
			}
		}
		field.Set(srcVal)
	case reflect.Map:
		// 尝试使用字符串作为键
		mapKey := reflect.ValueOf(lastPart)
		if !mapKey.Type().AssignableTo(val.Type().Key()) {
			// 如果键类型不匹配，尝试转换
			if val.Type().Key().Kind() == reflect.Int || val.Type().Key().Kind() == reflect.Int64 {
				if intKey, err := strconv.ParseInt(lastPart, 10, 64); err == nil {
					mapKey = reflect.ValueOf(intKey)
				} else {
					return errors.New("invalid map key type")
				}
			} else {
				return errors.New("map key type mismatch")
			}
		}

		// 设置map值
		srcVal := reflect.ValueOf(value)
		if !val.CanSet() {
			return errors.New("cannot set value to map")
		}
		val.SetMapIndex(mapKey, srcVal)
	default:
		return errors.New("unsupported type for setting nested field: " + val.Kind().String())
	}

	return nil
}

// getFieldType 获取字段的类型
func getFieldType(obj any, path string) (reflect.Type, error) {
	if path == "" {
		return nil, errors.New("field path cannot be empty")
	}

	// 分割路径
	parts := strings.Split(path, ".")
	valType := reflect.TypeOf(obj)

	// 处理指针类型
	if valType.Kind() == reflect.Ptr {
		valType = valType.Elem()
	}

	// 遍历路径的每一部分
	for _, part := range parts {
		// 根据类型获取下一级字段的类型
		switch valType.Kind() {
		case reflect.Struct:
			field, found := valType.FieldByName(part)
			if !found {
				return nil, errors.New("field not found: " + part)
			}
			valType = field.Type
			// 处理指针类型
			if valType.Kind() == reflect.Ptr {
				valType = valType.Elem()
			}
		case reflect.Map:
			// 对于map，返回值类型
			valType = valType.Elem()
			// 处理指针类型
			if valType.Kind() == reflect.Ptr {
				valType = valType.Elem()
			}
		default:
			return nil, errors.New("unsupported type for field access: " + valType.Kind().String())
		}
	}

	return valType, nil
}
```
